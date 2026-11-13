# 搭建、配置与维护

## 下载后直接使用

1. [下载 v0.2.0 单文件 HTML](https://github.com/josephinexyy/local-billing-workspace/releases/download/v0.2.0/Billing-Workspace-v0.2.0.html)，无需解压。
2. 在 Chrome 中打开下载的 `Billing-Workspace-v0.2.0.html`。
3. 点击右上角“体验演示”，先用虚构数据试用。

不用安装开发工具或注册账号。也可以下载[完整离线包 ZIP](https://github.com/josephinexyy/local-billing-workspace/releases/download/v0.2.0/Local-Billing-Workspace-v0.2.0.zip)，解压后按“使用说明.txt”操作。正式使用前退出演示；已有账本更新前先导出完整备份，再关闭旧版页面。

## 源码本机运行（开发者）

需要 Python 3。下载仓库 ZIP 后先解压，进入项目根目录，运行：

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Windows 可以将 `python3` 换成 `py`。打开 <http://127.0.0.1:8000>。保持相同端口和地址，避免把同一台电脑上的不同站点当成同一账本。

无需 npm 安装、数据库、API 密钥或 ChatGPT 登录。源码使用浏览器原生 JavaScript；Python 仅用于提供本机静态服务和打包离线文件。

## 首次设置

点击“公司设置”，输入公司中英文名称、登记号码、联系地址、收款资料及签署人。合同前缀支持 1–12 位英文字母或数字；时区采用 `Asia/Hong_Kong` 等有效标识。

设置只保存在当前浏览器。它不会更改公开仓库，也不会自动传到其他设备。完整备份会包含公司设置。导入时默认保留当前设置，只有勾选“同时恢复公司设置”才应用备份中的抬头及收款资料。

`dist/company.js` 是演示默认值。只有准备向公众展示的内容才应写入这个文件。个人或业务私密资料应通过浏览器设置填写。

## 体验演示业务

点击“体验演示”，或打开 <http://127.0.0.1:8000/?demo=1>。演示账本独立保存，默认有一笔待收款港币业务和一笔已收款美元业务，可以随时重置。退出后回到正式账本。

`examples/demo-backup.json` 是用于验证旧格式兼容的账本样例；`examples/demo-workspace-backup.json` 是包含公司设置的 v2 兼容样例。只在演示环境导入这些文件。

## 离线文件

`dist/Billing-Workspace.html` 是已经打包的单文件版本，双击打开即可。开发者修改代码后执行：

```bash
python3 scripts/build-offline.py
```

它会重新生成 `dist/Billing-Workspace.html`。若要同时生成包含第三方授权的 ZIP：

```bash
python3 scripts/build-offline.py local-billing-offline.zip
```

移动或重命名离线文件时，浏览器对本地存储的处理可能不同。迁移前先备份，在新位置导入；不要依赖原账本自动出现。

## 部署到自己的网址

将 `dist/` 目录交给支持静态 HTML、JS 和字体的托管环境。部署前保留所有相对路径、`vendor/`、`pdf-assets/` 和离线文件。

源码托管与线上运行是两件事。GitHub 可以托管源码；正式商业开票服务应选用适合业务用途的托管环境。GitHub Pages 对商业交易及商业 SaaS 用途有限制，不能将它默认作为商业系统的免费运行环境。

参考：[GitHub Pages 使用限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)。

公开网址上的当前实现仍是各浏览器各自保存数据，不会因此拥有共享账本。需要团队协作时，应另外设计登录、服务器存储、权限、备份和并发控制。

## 更新前后

1. 导出完整备份，确认其中包含账本和公司设置。
2. 关闭所有旧版程序页面，用虚构数据运行回归检查，核对页面和 PDF。
3. 更新程序；保持原网址、端口及存储键，或按迁移方案导入备份。
4. 核对客户数量、币种、单据金额及编号，再处理新业务。

## 排查问题

| 现象 | 处理 |
| --- | --- |
| 换设备后没有记录 | 从旧设备导出完整 JSON，在新设备导入，并按需勾选恢复公司设置 |
| 导入提示同号冲突 | 对照原记录核实，保留原始备份；不要直接覆盖 |
| OCR 未识别完整 | 使用清晰原件，核对并手动补齐；加密 PDF 先解锁 |
| 自定义英文无法生成 | 手动填写；浏览器翻译能力不是必需依赖 |
| 单张 PDF 失败 | 尝试页面“打印”并保存为 PDF |
| 本地数据损坏提示 | 先下载原始数据备份，停止录入并排查 |

不要在 Issue 中上传真实发票、客户证件、银行账号或完整账本。


## 公司设置迁移规则

新版备份使用 `format: local-billing-workspace` 和 `version: 3`，其中 `ledger` 保留原 v1 账本结构，`company` 保存公司配置。单据的 `issuer` 保存独立公司资料；旧 v1 / v2 文件可继续导入。

导入先核对记录和冲突，再选择是否恢复公司设置。保存时账本和公司设置写入同一个本地记录；写入失败不会先行改变公司设置。导入前的完整工作区快照可从“下载导入前备份”取回。

恢复公司设置只影响之后的新业务，已保存的公司快照保持不变。同号签发方冲突时阻止导入。旧备份缺少快照时会在确认页提示采用的资料来源；无法还原更早已经覆盖的设置。

## 开发检查

需要 Node.js 22+ 和 Python 3。npm 依赖只用于开发和测试。

```bash
npm ci --ignore-scripts
npm run check
npm run format:check
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run build
```

普通使用无需安装这些开发依赖。浏览器测试启动随机端口的本机服务和独立 Chromium 上下文，全部数据虚构。可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定已安装的 Chromium；默认使用 Playwright 的固定版本。

公开仓库的只读工作流运行格式、语法、业务、存储、离线构建一致性和实际浏览器测试，无需额外密钥。

开发者可运行 `python3 scripts/package-release.py` 生成带版本号的 HTML、ZIP 和 SHA-256 校验文件。版本读取自 `package.json`；发布文件记录来源提交，单文件也内含授权文本。脚本只允许打包已提交且未修改的运行文件；CI 会打开实际生成的文件，验证演示入口。

## 升级注意事项

关闭旧版页面，再更新程序并保持原网址。已有无快照记录会按升级时可取得的公司设置留底；备份页的“下载升级前原始备份”可以取回首次迁移前的记录。请先对照旧 PDF 核对资料。

同一浏览器、同一网址的新版页面可协调写入，不会因此拥有团队协作。源码和离线文件、不同端口或不同设备仍是独立账本。需要支持 Web Locks 的现代浏览器；不支持时可以查看和备份，写入会被拒绝。优先使用 `http://127.0.0.1:8000` 或 HTTPS；直接文件模式的行为取决于浏览器。
