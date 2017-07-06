// @flow
const chaiExpect = require("chai").expect;

import Crawler from "../crawler/Crawler";
import { dcEmitter } from "../crawler/supervisor";
import type { SpiderInterface } from "./SpiderInterface";
import SpiderMessage from "../crawler/store/entity/SpiderMessage";
import { errorLogger } from "../../utils/logger";

type ModelType = {
  [string]: string
};

/**
 * @function 爬虫类
 */
export default class Spider implements SpiderInterface {
  /**
   * @region 继承方式声明的属性
   */
  // 当前类名
  name: string = this.constructor.name;

  // 组件名
  displayName: string = "Spider";

  // 模型定义
  model: ModelType = {};

  // 通过构造函数传入，额外信息
  extra: any;

  /**
   * @region 构造函数方式传入的属性
   */
  url: string;

  option = {};

  /**
   * @region 手动设置的属性
   */
  crawler: Crawler;

  // 方法定义
  /**
   * @function 构造函数
   */
  constructor(extra?: any) {
    extra && (this.extra = extra);
  }

  /**
   * @param url
   * @param option
   * @returns {Spider}
   */
  setRequest(url: string, option: Object): Spider {
    // 设置路径与配置
    url && (this.url = url);
    option && (this.option = option);

    return this;
  }

  /**
   * @function 设置当前蜘蛛所属的爬虫
   * @param crawler
   */
  setCrawler(crawler?: Crawler) {
    crawler && (this.crawler = crawler);
    return this;
  }

  /**
   * Description 设置当前蜘蛛的额外信息，额外信息一部分是初始化时候的静态配置，一部分来源于上一个蜘蛛的动态信息
   * @param extra
   */
  setExtra(extra?: any) {
    extra && (this.extra = Object.assign({}, this.extra, extra));
    return this;
  }

  /**
   * @function 数据抓取
   */
  async fetch(url: string, option: Object): Promise<any> {
    return null;
  }

  /**
   * @function 数据提取之前的预处理
   * @param {*} rawData
   */
  before_extract(rawData: any): string {
    return rawData;
  }

  // 数据提取
  async extract(rawData: any, model: ModelType): Promise<Object> {
    // 如果是 HTMLSpider 中，则是返回 {data, $dom}
    return rawData;
  }

  // 数据解析
  async parse(extractedData: { [string]: any }, $?: Element): Promise<any> {
    return extractedData;
  }

  // 数据验证
  async validate(parsedData: any): Promise<boolean> {
    return true;
  }

  // 数据存储
  async persist(parsedData: any): Promise<boolean> {
    return true;
  }

  /**
   * @function 自动运行
   * @param isPersist
   * @returns {Promise.<Array.<Object>>}
   */
  async run(isPersist: boolean = true): Promise<Array<any>> {
    // 这里使用 crawler 校验仅当 Spider 嵌入到 Crawler 时候才运行
    this.crawler &&
      dcEmitter.emit(
        "Spider",
        new SpiderMessage(SpiderMessage.START_FETCH, this)
      );

    let rawData: any;

    try {
      if (!this.url) {
        throw new Error("请设置有效的 URL");
      }

      // 执行数据抓取
      rawData = await this.fetch(this.url, this.option);
    } catch (e) {
      // 如果这一步发生异常，则报错
      errorLogger.error(e.message);
      return;
    }

    this.crawler &&
      dcEmitter.emit(
        "Spider",
        new SpiderMessage(SpiderMessage.FINISH_FETCH, this)
      );

    let beforeExtractedRawData = this.before_extract(rawData);

    // 避免用户意外 Hook before_extract
    if (!!rawData && !beforeExtractedRawData) {
      throw new Error("before_extract 应当设置有效返回值！");
    }

    // 从界面中抽取出选定元素
    let extracedDataOrObject: Object = await this.extract(
      beforeExtractedRawData,
      this.model
    );

    this.crawler &&
      dcEmitter.emit(
        "Spider",
        new SpiderMessage(SpiderMessage.START_PARSE, this)
      );

    let parsedData: any;

    // 判断上一步的返回值是对象还是单个数据，这里是特意为 HTMLSpider 预留的功能，方便其返回文档的 DOM 对象到解析函数中
    if (
      typeof extracedDataOrObject === "object" &&
      extracedDataOrObject.hasOwnProperty("data") &&
      extracedDataOrObject.hasOwnProperty("$")
    ) {
      parsedData = await this.parse(
        extracedDataOrObject.data,
        extracedDataOrObject.$
      );
    } else {
      // 对元素进行解析
      parsedData = await this.parse(extracedDataOrObject);
    }

    this.crawler &&
      dcEmitter.emit(
        "Spider",
        new SpiderMessage(SpiderMessage.FINISH_PARSE, this)
      );

    // 对解析结果进行验证
    try {
      await this.validate(parsedData, chaiExpect);
      dcEmitter.emit(
        "Spider",
        new SpiderMessage(SpiderMessage.VALIDATE_OK, this)
      );
    } catch (e) {
      errorLogger.error(e.message);

      this.crawler &&
        dcEmitter.emit(
          "Spider",
          new SpiderMessage(SpiderMessage.VALIDATE_FAILURE, this, e.message)
        );
    }

    if (isPersist) {
      dcEmitter.emit(
        "Spider",
        new SpiderMessage(SpiderMessage.START_PERSIST, this)
      );

      // 一组执行完毕后进行数据写入
      await this.persist(parsedData);

      this.crawler &&
        dcEmitter.emit(
          "Spider",
          new SpiderMessage(SpiderMessage.FINISH_PERSIST, this)
        );
    }

    return parsedData;
  }
}
