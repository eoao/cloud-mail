
<p align="center">
  <img src="doc/demo/logo.png" width="80px" />
</p>

<div align="center">
<h1>Cloud Mail</h1>
</div>
<div align="center">
    <h4>A responsive email service built with Vue 3 that supports email sending and can be deployed on Cloudflare. 🎉</h4> 
</div>


## Project Showcase

- [Online Demo](https://skymail.ink)<br>
- [Deployment Guide](https://doc.skymail.ink/en/)<br>
- [Beginner’s Guide – UI Deployment](https://doc.skymail.ink/en/guide/via-ui.html)


| ![](/doc/demo/demo1.png) | ![](/doc/demo/demo2.png) |
|--------------------------|---------------------|
| ![](/doc/demo/demo3.png) | ![](/doc/demo/demo4.png) |
| ![](/doc/demo/demo5.png) | ![](/doc/demo/demo6.png) |
| ![](/doc/demo/demo7.png) | ![](/doc/demo/demo8.png) |

## Features

- **💰 Low-Cost Usage**: No server required — deploy to Cloudflare Workers to reduce costs.

- **💻 Responsive Design**: Automatically adapts to both desktop and most mobile browsers.

- **📧 Email Sending**: Integrated with Resend for bulk email sending, embedded images, attachments, and status tracking.

- **🛡️ Admin Features**: Admins can manage users and emails, with RBAC permission control to limit access to features and resources.

- **🔀 Multiple Accounts**: Users can add multiple email accounts. 

- **📦 Attachment Support**: Send and receive attachments, stored and downloaded via R2 object storage.

- **🔔 Email Push**: Forward received emails to Telegram bots or other email providers.

- **📡 Open API**: Supports batch user creation via API and multi-condition email queries

- **📈 Data Visualization**: Use Echarts to visualize system data, including user email growth.

- **⭐ Starred Emails**: Mark important emails for quick access.

- **🎨 Personalization**: Customize website title, login background, and transparency.

- **⚙️ Feature Settings**: Toggle on or off features like registration, email sending, and more, with the option to make the site private.

- **🤖 CAPTCHA**: Integrated with Turnstile CAPTCHA to prevent automated registration.

- **📜 More Features**: Under development...

## GitHub OAuth Configuration

To enable GitHub sign-in, configure the following Cloudflare Workers variables:

1. Visit [GitHub Developer settings](https://github.com/settings/developers) and create a new **OAuth App**. Set the `Authorization callback URL` to `https://<your-domain>/oauth/github/callback` (replace with your domain).
2. Copy the generated **Client ID** and **Client Secret**.
3. Add these variables to the `[vars]` section of `wrangler.toml`, `wrangler-dev.toml`, or via the Cloudflare Dashboard:
   - `githubClientId`
   - `githubClientSecret`
   - `githubRedirectUri` (must match the callback URL from step 1)
4. Redeploy the Worker and the login page will show the GitHub button automatically.

## Tech Stack

- **Framework**: [Vue3](https://vuejs.org/) + [Element Plus](https://element-plus.org/)

- **Web Framework**: [Hono](https://hono.dev/)

- **ORM**: [Drizzle](https://orm.drizzle.team/)

- **Platform**: [Cloudflare Workers](https://developers.cloudflare.com/workers/)

- **Email Service**: [Resend](https://resend.com/)

- **Caching**: [Cloudflare KV](https://developers.cloudflare.com/kv/)

- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/)

- **File Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/)


## Support


<a href="https://doc.skymail.ink/support.html">
<img width="170px" src="./doc/images/support.png" alt="">
</a><br><br>


**Special Sponsors**

[DartNode](https://dartnode.com)：Providing cloud computing service resource support.

[![Powered by DartNode](https://dartnode.com/branding/DN-Open-Source-sm.png)](https://dartnode.com "Powered by DartNode - Free VPS for Open Source")

## License

This project is licensed under the [MIT](LICENSE) license.

## Communication

[Telegram](https://t.me/cloud_mail_tg)
