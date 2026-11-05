# rulesets-domain —— Bettbox 聚合「自定义规则集地址」专用（domain 格式）

由 v4.6.1 规则表转换。Bettbox 1.19.8 聚合的自定义规则集按 **behavior=domain、format=text** 解析
（源码 assets/scripts/managed.js buildCustomServices + lib/common/managed_script.dart CustomRuleSet：
扩展名 .list/.txt → text；文件名/路径含 ip/geoip 才按 ipcidr）。文件内容只能是域名行：
`+.example.com` = 后缀匹配，纯域名行 = 该域名。已用 Mihomo 以同形态 provider 全量验证通过（15 文件 / 139 条）。

## 每条分流的配法（自定义文件 + 内置库补集）

| 分流 | 自定义文件（填「自定义规则集地址」） | 再从「＋添加规则集」补的内置集 |
|---|---|---|
| Claude | claude.list（6） | geosite:anthropic |
| OpenAI | openai.list（11） | geosite:openai |
| Meta | meta.list（19） | geosite:facebook、geosite:instagram、geosite:whatsapp |
| Google | google.list（18） | geosite:google |
| Social | social.list（17） | geosite:telegram、geosite:discord、geoip:telegram |
| X/Grok | x-grok.list（7） | geosite:twitter |
| Daily | daily.list（9） | geosite:github |
| FCM | fcm.list（4） | — |
| Manus | manus.list（10） | — |
| Hark | hark.list（2） | — |
| Brokerage | brokerage.list（8） | — |
| Shopping | shopping.list（16） | — |
| Wise/iFAST | wise-ifast.list（10） | — |
| Cloudflare Challenges | cloudflare-challenges.list（1） | — |
| 51cg | 51cg.list（1） | — |

## 不需要建的

- **Apple / Microsoft**：纯 GEOSITE 集（geosite:apple / geosite:microsoft），聚合的服务库里直接有现成服务条目。
- **国内直连 / 国外穿墙**：聚合托管脚本的基础逻辑自带（private、cn 直连，geolocation-!cn 走默认代理）。
- **WebRTC**：原表是 DST-PORT 端口规则（3478/5349/19302），域名集表达不了；托管脚本自带
  「屏蔽代理QUIC流量」开关（默认开）是其 QUIC 等价物，STUN 端口封堵无等价项。

## 出口对应

分流条目的「默认出口」：多数选**默认代理**（≈ 跟随主选择）；国内直连类选直连；
有固定地区偏好的（如券商→美国）按需单选地区。

## 注意

- GitHub raw 链接填入后，App 会自动改写为 jsdmirror 镜像地址拉取（源码 mirrorUrl），国内更稳。
- 本目录文件与 rulesets/（classical 版，供 Mihomo 规则集直用）是两套格式，别混用。
