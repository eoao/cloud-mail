# 通知推送架构

## 设计原则

借鉴 Uptime-Kuma 的插件化通知模式，针对 Cloud Mail 场景简化为：

- **Provider 插件化**：每种通知方式独立文件，继承基类
- **注册表分发**：统一 dispatch 入口，按 type 路由到对应 provider
- **配置分离**：通知规则独立存表 `notify_rule`，与系统设置解耦
- **渐进替换**：新老系统共存，旧 TG 推送不受影响

## 架构图

```
email.js (dispatch)
    └── Notification.sendAll(env, emailData)
            ├── providerList['onebot']   → OneBotProvider.send()
            ├── providerList['webhook']   → WebhookProvider.send()
            └── providerList['telegram']  → TelegramProvider.send()
```

## 目录结构

```
mail-worker/src/notification/
├── notification-provider.js    # 基类 (name + send)
├── notification.js             # 注册表 + 分发入口
└── providers/
    ├── index.js                # 加载所有 provider
    ├── webhook.js              # 通用 Webhook
    ├── onebot.js               # OneBot 推送
    └── telegram.js             # 新 TG 推送 (未来替换旧 TG)
```

## 数据表

### notify_rule

| 字段        | 类型       | 说明                                       |
| ----------- | ---------- | ------------------------------------------ |
| id          | INTEGER PK | 自增主键                                   |
| type        | TEXT       | provider 类型: onebot / webhook / telegram |
| name        | TEXT       | 规则名称 (可空)                            |
| config      | TEXT       | JSON 配置                                  |
| enabled     | INTEGER    | 0=禁用 1=启用                              |
| create_time | DATETIME   | 创建时间                                   |

## Provider 配置格式

### OneBot (`type: "onebot"`)

```json
{
  "url": "http://host:port/api/send_msg",
  "token": "Bearer token or empty",
  "targetIds": "12345678,87654321",
  "msgType": "private"
}
```

### Webhook (`type: "webhook"`)

```json
{
  "url": "https://example.com/webhook",
  "method": "POST",
  "headers": { "X-Custom": "value" },
  "bodyTemplate": "{ \"msg\": \"{{subject}}\" }",
  "contentType": "json"
}
```

### Telegram (`type: "telegram"`)

```json
{
  "botToken": "123:ABC",
  "chatIds": "123456,-987654",
  "msgFrom": "only-name",
  "msgTo": "show",
  "msgText": "hide",
  "customDomain": "mail.example.com"
}
```

## API 端点

| 方法   | 路径               | 说明             |
| ------ | ------------------ | ---------------- |
| GET    | `/notify/list`     | 获取所有通知规则 |
| POST   | `/notify/add`      | 新增规则         |
| PUT    | `/notify/set`      | 修改规则         |
| DELETE | `/notify/delete`   | 删除规则         |
| POST   | `/notify/test/:id` | 测试推送         |

## 迁移路径

1. **Phase 1** (当前): 新架构与旧 TG 共存，互不干扰
2. **Phase 2** (未来): 创建 `TelegramProvider`，将旧 TG 配置迁移到 `notify_rule` 表
3. **Phase 3** (未来): 删除 `setting` 表的 `tg_*` 字段，删除旧 `telegram-service.js`

> 修改此文档时请同步更新代码实现。
