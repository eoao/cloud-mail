<p align="center">
    <img src="doc/demo/logo.png" width="80px" />
    <h1 align="center">Cloud Mail</h1>
    <p align="center">基于 Cloudflare 的简约响应式邮箱服务，支持邮件发送、附件收发 🎉</p> 
    <p align="center">
        <a href="https://github.com/maillab/cloud-mail/tree/main?tab=MIT-1-ov-file" target="_blank" >
            <img src="https://img.shields.io/badge/license-GPLv3-blue" />
        </a>    
        <a href="https://github.com/maillab/cloud-mail/releases" target="_blank" >
            <img src="https://img.shields.io/github/v/release/maillab/cloud-mail" alt="releases" />
        </a>  
        <a href="https://github.com/maillab/cloud-mail/issues" >
            <img src="https://img.shields.io/github/issues/maillab/cloud-mail" alt="issues" />
        </a>  
        <a href="https://github.com/maillab/cloud-mail/stargazers" target="_blank">
            <img src="https://img.shields.io/github/stars/maillab/cloud-mail" alt="stargazers" />
        </a>  
        <a href="https://github.com/maillab/cloud-mail/forks" target="_blank" >
            <img src="https://img.shields.io/github/forks/maillab/cloud-mail" alt="forks" />
        </a>
    </p>
    <p align="center">
        <a href="https://trendshift.io/repositories/20459" target="_blank" >
            <img src="https://trendshift.io/api/badge/repositories/20459" alt="trendshift" >
        </a>
    </p>
</p>

> [!IMPORTANT]
> 本项目基于 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 修改,主要变更:
> - **通知系统重构**: 新增 OneBot / Telegram / Webhook 三种通知方式,支持自定义 Headers、Body 模板变量、Content-Type
> - **邮件迁移功能**: 自动匹配未分配的旧邮件到对应邮箱,支持一键迁移

## 项目简介

只需要一个域名，就可以创建多个不同的邮箱，类似各大邮箱平台，本项目支持署到 Cloudflare Workers ，降低服务器成本，搭建自己的邮箱服务

## 项目展示

- [在线演示](https://skymail.ink)<br>
- [部署文档](https://doc.skymail.ink)<br>

| ![](/doc/demo/demo1.png) | ![](/doc/demo/demo2.png) |
| ------------------------ | ------------------------ |
| ![](/doc/demo/demo3.png) | ![](/doc/demo/demo4.png) |

## 功能介绍

- **💰 低成本使用**： 可部署到 Cloudflare Workers 降低服务器成本

- **💻 响应式设计**：响应式布局自动适配PC和大部分手机端浏览器

- **📧 邮件发送**：集成Resend发送邮件，支持群发，内嵌图片和附件发送，发送状态查看

- **🛡️ 管理员功能**：可以对用户，邮件进行管理，RABC权限控制对功能及使用资源限制

- **📦 附件收发**：支持收发附件，使用R2对象存储保存和下载文件

- **🔔 邮件推送**：接收邮件后可以转发到TG机器人或其他服务商邮箱

- **📢 多渠道通知**：支持 7 个通知渠道，邮件到达时自动推送
  - OneBot
  - Telegram (HTML/MarkdownV2)
  - Webhook (POST/GET, 自定义 Headers/Body/Content-Type)

- **📡 开放API**：支持使用API批量生成用户，多条件查询邮件

- **🔢 验证码识别**：使用Workers AI，自动识别邮件验证码

- **📈 数据可视化**：使用ECharts对系统数据详情，用户邮件增长可视化显示

- **🎨 个性化设置**：可以自定义网站标题，登录背景，透明度

- **🤖 人机验证**：集成Turnstile人机验证，防止人机批量注册

- **📜 更多功能**：正在开发中...

## 技术栈

- **平台**：[Cloudflare Workers](https://developers.cloudflare.com/workers/)

- **Web框架**：[Hono](https://hono.dev/)

- **ORM：**[Drizzle](https://orm.drizzle.team/)

- **前端框架**：[Vue3](https://vuejs.org/)

- **UI框架**：[Element Plus](https://element-plus.org/)

- **邮件推送：** [Resend](https://resend.com/)

- **缓存**：[Cloudflare KV](https://developers.cloudflare.com/kv/)

- **数据库**：[Cloudflare D1](https://developers.cloudflare.com/d1/)

- **文件存储**：[Cloudflare R2](https://developers.cloudflare.com/r2/)

## 环境变量

在 `wrangler.toml` 中配置，详见 [wrangler.example.toml](mail-worker/wrangler.example.toml)

| 变量             | 必填 | 说明                                                        |
| ---------------- | ---- | ----------------------------------------------------------- |
| `domain`         | ✅   | 邮件域名，支持多个，如 `["example.com"]`                    |
| `admin`          | ✅   | 管理员邮箱                                                  |
| `jwt_secret`     | ✅   | JWT 密钥                                                    |
| `timezone`       | ❌   | 通知时间戳时区，默认 `Asia/Shanghai`，如 `America/New_York` |
| `project_link`   | ❌   | 是否显示项目链接，默认 `false`                              |
| `ai_model`       | ❌   | AI 模型，默认使用 `@cf/meta/llama-3.1-8b-instruct`          |
| `analysis_cache` | ❌   | 是否开启分析数据缓存，默认 `false`                          |
| `orm_log`        | ❌   | 是否开启 SQL 日志，默认 `false`                             |

## 目录结构

```
cloud-mail
├── mail-worker				    # worker后端项目
│   ├── src
│   │   ├── api	 			    # api接口层
│   │   ├── const  			    # 项目常量
│   │   ├── dao                 # 数据访问层
│   │   ├── email			    # 邮件处理接收
│   │   ├── entity			    # 数据库实体
│   │   ├── notification		    # 多渠道通知系统
│   │   ├── error			    # 自定义异常
│   │   ├── hono			    # web框架配置、拦截器、全局异常等
│   │   ├── i18n			    # 语言国际化
│   │   ├── init			    # 数据库缓存初始化
│   │   ├── model			    # 响应体数据封装
│   │   ├── security			# 身份权限认证
│   │   ├── service			    # 业务服务层
│   │   ├── template			# 消息模板
│   │   ├── utils			    # 工具类
│   │   └── index.js			# 入口文件
│   ├── pageckge.json			# 项目依赖
│   └── wrangler.toml			# 项目配置
│
├── mail-vue				    # vue前端项目
│   ├── src
│   │   ├── axios 			    # axios配置
│   │   ├── components			# 自定义组件
│   │   ├── echarts			    # echarts组件导入
│   │   ├── i18n			    # 语言国际化
│   │   ├── init			    # 入站初始化
│   │   ├── layout			    # 主体布局组件
│   │   ├── perm			    # 权限认证
│   │   ├── request			    # api接口
│   │   ├── router			    # 路由配置
│   │   ├── store			    # 全局状态管理
│   │   ├── utils			    # 工具类
│   │   ├── views			    # 页面组件
│   │   ├── app.vue			    # 入口组件
│   │   ├── main.js			    # 入口js
│   │   └── style.css			# 全局css
│   ├── package.json			# 项目依赖
└── └── env.release				# 项目配置
```

## 赞助

<a href="https://cn3.top/blog/sponsor/" >
<img width="170px" src="./doc/images/support.png" alt="">
</a>

## 许可证

本项目采用 [GPLv3](LICENSE) 许可证

## Upstream

本项目基于 [maillab/cloud-mail](https://github.com/maillab/cloud-mail) 修改
