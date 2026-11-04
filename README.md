# Bettbox 覆写脚本（v4.6 分享版）

Bettbox（FlClash 系，Mihomo 内核）专用的 JS 覆写脚本：一份脚本适配多家机场，自动分流、地区分组，并为带私有 DoH 的机场逐家生成节点域名解析策略。

## 导入方法

Bettbox → 配置 → 选中订阅 → 覆写/脚本 → 通过 URL 导入，粘贴：

```
https://raw.githubusercontent.com/ZaneZhanghz/bettbox-scripts/main/bettbox-override-v4.6-share.js
```

备用镜像（若 jsDelivr 返回 404，请使用上方 raw 链接）：
```
https://cdn.jsdelivr.net/gh/ZaneZhanghz/bettbox-scripts@main/bettbox-override-v4.6-share.js
 ```

 导入后在该订阅上启用此脚本即可。脚本更新后，在 Bettbox 里对该脚本执行一次更新即可拉取新版，无需重新导入。

## 主要功能

- 完整的服务分流组（AI / 流媒体 / 社交 / 游戏等）与地区组，带 Bettbox 可视化开关（覆写界面调开关，无需改代码）
- **私有 DNS 登记表**：Nowhere、Doro 这类节点域名必须经机场私有 DoH 解析的机场，脚本会扫描节点域名后缀，并**优先自动识别订阅自带的 DoH** 生成 `proxy-server-nameserver-policy`，各走各家、互不干扰
- fake-ip 模式 + 嗅探开启；服务组默认跟随「手动选择」枢纽，切换机场只切一处
- 信息节点（剩余流量 / 到期 / 官网等）自动归入「机场信息」组，不掺进测速

## 关于本分享版

- 本文件已**清空作者个人的私有 DoH 兜底值**（`PRIVATE_DNS` 登记表中的两处 `doh` 字段），逻辑与个人版完全一致。
- 对单独导入的 Nowhere / Doro 订阅：其自带 DoH 会被自动识别，**开箱即用，无需填写任何东西*
- *。
- 对合并订阅（多机场拼成一份、且合并产物的 DNS 中不含任何机场 DoH）：自动识别无从下手，此时需要使用者把**自己**的兜底 DoH 填进登记表对应行；不填则那两家"私有解析"节点的连接会失败，其余节点不受影响。
- 新增机场只需在 `PRIVATE_DNS` 登记表加一行（域名后缀 + 该机场的 DoH），其余逻辑自动完成。

## 注意

- 使用时请关闭 Bettbox 自带的「DNS 覆写」，否则会覆盖本脚本的 DNS 设置。
- 本脚本仅处理内联 `proxies` 的配置；`proxy-providers` 型配置会原样返回。
