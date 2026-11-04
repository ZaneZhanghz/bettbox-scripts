const Compatible_With_Bettbox = { ruleOptionsEnable: true, policyGroupOptions: ["地区分组", "TikTok分流", "启用登记DoH", "屏蔽国外QUIC"] };

// ==== §0 · 开关默认值 ====
const ruleOptionsEnable = {
  "地区分组": true,
  "TikTok分流": false,
  "启用登记DoH": true,
  "屏蔽国外QUIC": true
};

// ==== 目录 ====
// §1 版本摘要与使用说明
// §2 常量
// §3 私有 DNS 登记表（含账号令牌，分享前清空）
// §4 服务组
// §5 地区定义
// §6 分流规则
// §7 主逻辑 main
// 文末附：历史纪要（v4.5 起，原文保留）

// ==== §1 · 版本摘要与使用说明 ====
// Bettbox 专用覆写脚本 v4.6.1（v4.6 ＋ 吹雪云 PSN 修复 ＋ 定稿项：地区组全手动、结构重组）
// 用法：设置 -> 高级设置 -> 脚本，添加本脚本；配置 -> 对应订阅 -> 覆写 -> 脚本，关联后刷新订阅。
// 重要：必须关闭 Bettbox 自带的「DNS 覆写」，否则 App 会在脚本执行后重写 dns，
//       本脚本的 nameserver-policy 与 proxy-server-nameserver-policy（私有 DoH）都会被覆盖失效。
// 开关说明（Bettbox v1.18.8+ 会在覆写界面显示为可视化开关，调用 main 前注入选择）：
//   地区分组    ：按节点名生成 香港/日本/新加坡/台湾/美国/其他 组（v4.6.1 起全手动），并挂到 手动选择 下。
//   TikTok分流  ：额外生成 TikTok 组并加 GEOSITE,tiktok 规则（默认关，源分流表里原本没有）。
//   启用登记DoH：（v4.6 起由原「nowhere私有DoH」改名，实际管所有登记机场）开时按下方 PRIVATE_DNS 登记表，
//                 用 proxy-server-nameserver-policy 把每个机场的节点服务器域名各自指给它自己的私有 DoH；
//                 proxy-server-nameserver 本体保持普通 DNS，未登记的节点不会误用别家的私有 DoH。
//   屏蔽国外QUIC：开时在规则前部加一条 AND 规则，REJECT 国外（含非 CN、非私有）的 UDP 443，
//                 防止应用走 QUIC 绕过分流；CN 与私有地址的 QUIC 不受影响。
//                 判断同时用 GEOSITE（域名连接）与 GEOIP（直连 IP）：fake-ip 下域名连接没有目标 IP，
//                 只靠 GEOIP,no-resolve 会匹配不上、把国内 QUIC 也误杀。
// v4.6.1 变更（2026-11-04）：
//   1) 吹雪云修复：订阅原配 proxy-server-nameserver 全为公共解析时原样保留（判定逻辑见 §7 DNS 段）；
//      v4.6 固定换成单家阿里 DoH 会让吹雪云移联节点大面积 timeout，2026-11-04 单变量实测坐实。
//      源 PSN 带私有 DoH 的仍不保留，私有解析继续走 §3 登记表 policy 分流，合并配置不受影响。
//   2) 地区组改全手动 select（定稿项）：不再 url-test 自动测速选节点；地区组与其它 select 组
//      一致，组末带 REJECT 拦截选项。地区组既已全手动，原测速参数（TEST_URL/interval 等）
//      已无消费者，一并移除（与定稿结构规格的小出入：规格原列其入 §2，现按无消费者处理）。
//   3) 结构重组（定稿项）：数据区在上、逻辑区在下分段排布；§0 声明与 v4.6 逐字节一致；
//      历史纪要移至 main 之后的文件末尾。除 1、2 外行为与 v4.6 一致。

// ==== §2 · 常量 ====
// 策略组图标：借用 AIsouler/MyClash 仓库的 SVG 图标（jsdmirror CDN 加速）；Claude 组图标
// 在 §4 里单独钉在 simple-icons@15.0.0（官方星芒标，URL 必须带 .svg 后缀才加载）。
const ICON_BASE = "https://cdn.jsdmirror.com/gh/AIsouler/MyClash@main/Icons/svg/";
// 服务组（before 为空的那些：Claude/OpenAi/Google 等）默认是否跟随「手动选择」；设为 false 则恢复为默认落在第一个节点。
const DEFAULT_TO_MANUAL = true;
// 信息节点识别：命中即判为信息节点（剩余流量/到期/官网等），不进地区组、不占各组默认位，只排在各组末尾备用。
// v4.6 起去掉容易误伤真实节点的泛词（备用/流量/更新/登录/提示/无法/导航/发布/获取），流量类改按「流量：」「xxGB」「expire/traffic」匹配。
const INFO_RE = /(剩余|到期|过期|套餐|重置|公告|官网|说明|交流群|TG群|返利|循环|客服|网站|网址|订阅|机场|联系|邮箱|工单|贩卖|倒卖|防止|频道|电报|教程|关注|优惠|福利|邀请|好友|失联|余额)|流量\s*[:：]|\d+(\.\d+)?\s*[GT]B\b|\b(expire[sd]?|traffic)\b/i;
// 国外 QUIC 拦截规则（屏蔽国外QUIC 开时插到规则前部）：判断同时用 GEOSITE（域名连接）与 GEOIP（直连 IP），
// fake-ip 下域名连接没有目标 IP，只靠 GEOIP,no-resolve 会匹配不上、把国内 QUIC 也误杀（详见 §1 开关说明）。
const QUIC_RULE = "AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((OR,((GEOSITE,cn),(GEOSITE,private),(GEOIP,CN,no-resolve),(GEOIP,private,no-resolve)))))),REJECT";
// DNS 基础参数（§7 的 DNS 段在此之上再叠加 §3 登记表生成的 policy 与 fake-ip 条目）。
const DEFAULT_NAMESERVER = ["223.5.5.5", "180.76.76.76"];
const NAMESERVER = ["https://dns.cloudflare.com/dns-query", "https://dns.google/dns-query"];
const CN_DOH = "https://223.5.5.5/dns-query";
const PSN_DEFAULT = ["https://223.5.5.5/dns-query"];
const FAKE_IP_FILTER_BASE = [
    "*.lan", "*.local", "*.home.arpa", "*.localhost", "localhost",
    "time.windows.com", "time.nist.gov", "time.apple.com", "time.asia.apple.com", "time.google.com",
    "+.pool.ntp.org", "ntp.aliyun.com", "ntp.tencent.com",
    "stun.*.*", "stun.*.*.*", "+.stun.*.*",
    "www.msftconnecttest.com", "+.msftconnecttest.com", "www.msftncsi.com", "*.msftncsi.com",
    "captive.apple.com", "connectivitycheck.gstatic.com",
    "localhost.ptlogin2.qq.com", "+.push.apple.com"
  ];
// 嗅探跳过域名：这些域名的连接不做嗅探还原。
const SNIFF_SKIP_DOMAIN = ["Mijia Cloud", "dlg.io.mi.com", "+.push.apple.com"];

// ==== §3 · 私有 DNS 登记表 ====
// ⚠ 本段含账号令牌（PRIVATE_DOH / DORO_DOH 的路径段）：分享前务必清空，或直接用分享版文件。
// 安全提示：下面这条私有 DoH 仅作兜底——订阅原配置里能识别到私有 DoH 时优先用订阅自带的，识别不到才用这条。
// 它的路径里含你的账号令牌，本脚本仍等同于订阅链接，切勿公开分享或上传到任何仓库；
// 若令牌泄露，只能找机场重置订阅令牌后同步改这一行（脚本侧无法自行更换）。
const PRIVATE_DOH = "";
// Doro 的私有 DoH（念云）兜底：其「广港专线」节点（tengxun.dorocloud.xyz）必须经它解析，公共 DNS 解析会断联；
// 同样优先沿用订阅原配置自带的，识别不到才用这条；路径含 Doro 账号令牌，同样切勿外传。
const DORO_DOH = "";
// 私有 DNS 机场登记表：每个用私有 DoH 的机场一条。
//   servers：该机场节点「服务器域名」的后缀（匹配 proxies[].server，命中则生成 +.后缀 的 policy）；
//   nameRe ：可选，节点服务器域名没有统一后缀时，改按节点名匹配，此时 policy 只锁各节点的完整服务器域名；
//   detect ：在订阅原 DNS 里识别该机场自带 DoH 用的关键字（含其一即认定，优先于内置兜底）；
//   doh    ：内置兜底 DoH（订阅里识别不到时才用）；没有兜底就留空，识别不到则该机场不生成 policy。
// 新机场示例：{ name: "XXX", servers: ["xxx-node.com"], detect: ["xxx-dns.com"], doh: "https://dns.xxx-dns.com/dns-query/令牌" },
const PRIVATE_DNS = [
  { name: "Nowhere", servers: ["nowhere-backend.xyz"], detect: ["nowhere-backend.xyz"], doh: PRIVATE_DOH },
  { name: "Doro", servers: ["dorocloud.xyz"], detect: ["nianyun.net", "dorocloud"], doh: DORO_DOH }
];

// ==== §4 · 服务组 ====
const SERVICE_GROUPS = [
  {
    "name": "Cloudflare Challenges",
    "icon": "Bypass.svg",
    "before": [],
    "after": []
  },
  {
    "name": "Claude",
    "icon": "https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons/claude.svg",
    "before": [],
    "after": []
  },
  {
    "name": "OpenAi",
    "icon": "OpenAI.svg",
    "before": [],
    "after": []
  },
  {
    "name": "Google/Gemini",
    "icon": "Google.svg",
    "before": [],
    "after": []
  },
  {
    "name": "FCM",
    "icon": "Fcm.svg",
    "before": [],
    "after": []
  },
  {
    "name": "Manus",
    "icon": "Server.svg",
    "before": [],
    "after": []
  },
  {
    "name": "Meta/Muse",
    "icon": "Meta.svg",
    "before": [],
    "after": []
  },
  {
    "name": "hark",
    "icon": "Stack.svg",
    "before": [],
    "after": []
  },
  {
    "name": "X/Grok",
    "icon": "Twitter.svg",
    "before": [],
    "after": []
  },
  {
    "name": "Social",
    "icon": "Telegram.svg",
    "before": [],
    "after": []
  },
  {
    "name": "Brokerage",
    "icon": "Available.svg",
    "before": [],
    "after": []
  },
  {
    "name": "Daily",
    "icon": "GitHub.svg",
    "before": [],
    "after": []
  },
  {
    "name": "Shopping",
    "icon": "Global.svg",
    "before": [],
    "after": []
  },
  {
    "name": "51cg",
    "icon": "EHentai.svg",
    "before": [],
    "after": []
  },
  {
    "name": "WebRtc拦截",
    "icon": "AdBlock.svg",
    "before": [
      "REJECT"
    ],
    "after": []
  },
  {
    "name": "Wise/iFast",
    "icon": "PayPal.svg",
    "before": [
      "DIRECT"
    ],
    "after": []
  },
  {
    "name": "Apple",
    "icon": "Apple.svg",
    "before": [
      "DIRECT"
    ],
    "after": []
  },
  {
    "name": "Microsoft",
    "icon": "Microsoft.svg",
    "before": [
      "DIRECT"
    ],
    "after": []
  },
  {
    "name": "国内直连",
    "icon": "China.svg",
    "before": [
      "DIRECT"
    ],
    "after": []
  },
  {
    "name": "国外穿墙",
    "icon": "Proxy.svg",
    "before": [
      "自动选择"
    ],
    "after": [
      "DIRECT"
    ]
  }
];

// ==== §5 · 地区定义 ====
const REGION_DEFS = [
  ["香港组", /(香港|Hong\s?Kong|\bHK(?![A-Za-z])|🇭🇰)/i, "HongKong.svg"],
  ["日本组", /(日本|Japan|\bJP(?![A-Za-z])|东京|東京|大阪|Tokyo|Osaka|🇯🇵)/i, "Japan.svg"],
  ["新加坡组", /(新加坡|Singapore|\bSG(?![A-Za-z])|狮城|獅城|🇸🇬)/i, "Singapore.svg"],
  ["台湾组", /(台湾|台灣|Taiwan|\bTW(?![A-Za-z])|台北|Taipei|🇹🇼)/i, "Taiwan.svg"],
  ["美国组", /(美国|美國|United\s?States|\bUSA?(?![A-Za-z])|洛杉矶|洛杉磯|Los\s?Angeles|San\s?Jose|🇺🇸)/i, "America.svg"]
];

// ==== §6 · 分流规则 ====
const RULES = [
  "DST-PORT,3478,WebRtc拦截",
  "DST-PORT,5349,WebRtc拦截",
  "DST-PORT,19302,WebRtc拦截",
  "DOMAIN-SUFFIX,challenges.cloudflare.com,Cloudflare Challenges",
  "DOMAIN-SUFFIX,anthropic.com,Claude",
  "DOMAIN-SUFFIX,claude.ai,Claude",
  "DOMAIN-SUFFIX,claude.com,Claude",
  "DOMAIN-SUFFIX,claudeusercontent.com,Claude",
  "DOMAIN-SUFFIX,anthropicusercontent.com,Claude",
  "DOMAIN-SUFFIX,clau.de,Claude",
  "GEOSITE,anthropic,Claude",
  "DOMAIN-SUFFIX,openai.com,OpenAi",
  "DOMAIN-SUFFIX,chatgpt.com,OpenAi",
  "DOMAIN-SUFFIX,chat.com,OpenAi",
  "DOMAIN-SUFFIX,ai.com,OpenAi",
  "DOMAIN-SUFFIX,sora.com,OpenAi",
  "DOMAIN-SUFFIX,oaistatic.com,OpenAi",
  "DOMAIN-SUFFIX,oaiusercontent.com,OpenAi",
  "DOMAIN-SUFFIX,openaiapi-site.azureedge.net,OpenAi",
  "DOMAIN-SUFFIX,openaicom-api-bdcpf8c6d2e9atf6.z01.azurefd.net,OpenAi",
  "DOMAIN-SUFFIX,openaicomproductionae4b.blob.core.windows.net,OpenAi",
  "DOMAIN-SUFFIX,production-openaicom-storage.azureedge.net,OpenAi",
  "GEOSITE,openai,OpenAi",
  "DOMAIN-SUFFIX,mtalk.google.com,FCM",
  "DOMAIN-SUFFIX,firebaseinstallations.googleapis.com,FCM",
  "DOMAIN-SUFFIX,firebase.googleapis.com,FCM",
  "DOMAIN-SUFFIX,fcm.googleapis.com,FCM",
  "DOMAIN-SUFFIX,google.com,Google/Gemini",
  "DOMAIN-SUFFIX,googleapis.com,Google/Gemini",
  "DOMAIN-SUFFIX,gstatic.com,Google/Gemini",
  "DOMAIN-SUFFIX,gvt1.com,Google/Gemini",
  "DOMAIN-SUFFIX,gvt2.com,Google/Gemini",
  "DOMAIN-SUFFIX,gvt3.com,Google/Gemini",
  "DOMAIN-SUFFIX,ggpht.com,Google/Gemini",
  "DOMAIN-SUFFIX,googleusercontent.com,Google/Gemini",
  "DOMAIN-SUFFIX,googlevideo.com,Google/Gemini",
  "DOMAIN-SUFFIX,ytimg.com,Google/Gemini",
  "DOMAIN-SUFFIX,youtube.com,Google/Gemini",
  "DOMAIN-SUFFIX,youtu.be,Google/Gemini",
  "DOMAIN-SUFFIX,withgoogle.com,Google/Gemini",
  "DOMAIN-SUFFIX,goog,Google/Gemini",
  "DOMAIN-SUFFIX,goo.gl,Google/Gemini",
  "DOMAIN-SUFFIX,recaptcha.net,Google/Gemini",
  "DOMAIN-SUFFIX,g.co,Google/Gemini",
  "DOMAIN-SUFFIX,ai.google.dev,Google/Gemini",
  "GEOSITE,google,Google/Gemini",
  "DOMAIN-SUFFIX,manus.im,Manus",
  "DOMAIN-SUFFIX,manus.ai,Manus",
  "DOMAIN-SUFFIX,manuscdn.com,Manus",
  "DOMAIN-SUFFIX,manusstatic.com,Manus",
  "DOMAIN-SUFFIX,manus.space,Manus",
  "DOMAIN-SUFFIX,cue.so,Manus",
  "DOMAIN-SUFFIX,cue.im,Manus",
  "DOMAIN-SUFFIX,cueusercontent.com,Manus",
  "DOMAIN-SUFFIX,cue.ai,Manus",
  "DOMAIN-SUFFIX,cue.com,Manus",
  "DOMAIN-SUFFIX,facebook.com,Meta/Muse",
  "DOMAIN-SUFFIX,fb.com,Meta/Muse",
  "DOMAIN-SUFFIX,fbcdn.net,Meta/Muse",
  "DOMAIN-SUFFIX,facebook.net,Meta/Muse",
  "DOMAIN-SUFFIX,fbsbx.com,Meta/Muse",
  "DOMAIN-SUFFIX,messenger.com,Meta/Muse",
  "DOMAIN-SUFFIX,messengercdn.com,Meta/Muse",
  "DOMAIN-SUFFIX,m.me,Meta/Muse",
  "DOMAIN-SUFFIX,instagram.com,Meta/Muse",
  "DOMAIN-SUFFIX,cdninstagram.com,Meta/Muse",
  "DOMAIN-SUFFIX,threads.net,Meta/Muse",
  "DOMAIN-SUFFIX,whatsapp.com,Meta/Muse",
  "DOMAIN-SUFFIX,whatsapp.net,Meta/Muse",
  "DOMAIN-SUFFIX,meta.com,Meta/Muse",
  "DOMAIN-SUFFIX,meta.ai,Meta/Muse",
  "DOMAIN-SUFFIX,muse.ai,Meta/Muse",
  "DOMAIN-SUFFIX,metaaivm.com,Meta/Muse",
  "DOMAIN-SUFFIX,oculus.com,Meta/Muse",
  "DOMAIN-SUFFIX,workplace.com,Meta/Muse",
  "GEOSITE,facebook,Meta/Muse",
  "GEOSITE,instagram,Meta/Muse",
  "GEOSITE,whatsapp,Meta/Muse",
  "DOMAIN-SUFFIX,hark.ai,hark",
  "DOMAIN-SUFFIX,harkapp.ai,hark",
  "DOMAIN-SUFFIX,x.com,X/Grok",
  "DOMAIN-SUFFIX,twitter.com,X/Grok",
  "DOMAIN-SUFFIX,twimg.com,X/Grok",
  "DOMAIN-SUFFIX,t.co,X/Grok",
  "DOMAIN-SUFFIX,tweetdeck.com,X/Grok",
  "DOMAIN-SUFFIX,x.ai,X/Grok",
  "DOMAIN-SUFFIX,grok.com,X/Grok",
  "GEOSITE,twitter,X/Grok",
  "DOMAIN-SUFFIX,telegram.org,Social",
  "DOMAIN-SUFFIX,t.me,Social",
  "DOMAIN-SUFFIX,telegra.ph,Social",
  "DOMAIN-SUFFIX,telegram.me,Social",
  "DOMAIN-SUFFIX,telegram.dog,Social",
  "DOMAIN-SUFFIX,telesco.pe,Social",
  "DOMAIN-SUFFIX,tdesktop.com,Social",
  "DOMAIN-SUFFIX,telegram-cdn.org,Social",
  "DOMAIN-SUFFIX,discord.com,Social",
  "DOMAIN-SUFFIX,discord.gg,Social",
  "DOMAIN-SUFFIX,discord.media,Social",
  "DOMAIN-SUFFIX,discord.dev,Social",
  "DOMAIN-SUFFIX,discord.gift,Social",
  "DOMAIN-SUFFIX,discord.new,Social",
  "DOMAIN-SUFFIX,discordapp.com,Social",
  "DOMAIN-SUFFIX,discordapp.net,Social",
  "DOMAIN-SUFFIX,discordstatus.com,Social",
  "GEOSITE,telegram,Social",
  "GEOSITE,discord,Social",
  "GEOIP,telegram,Social,no-resolve",
  "DOMAIN-SUFFIX,interactivebrokers.com,Brokerage",
  "DOMAIN-SUFFIX,ibkr.com,Brokerage",
  "DOMAIN-SUFFIX,ibllc.com,Brokerage",
  "DOMAIN-SUFFIX,schwab.com,Brokerage",
  "DOMAIN-SUFFIX,schwabcdn.com,Brokerage",
  "DOMAIN-SUFFIX,firstrade.com,Brokerage",
  "DOMAIN-SUFFIX,ftstatic.com,Brokerage",
  "DOMAIN-SUFFIX,clientam.com,Brokerage",
  "DOMAIN-SUFFIX,github.com,Daily",
  "DOMAIN-SUFFIX,githubusercontent.com,Daily",
  "DOMAIN-SUFFIX,githubassets.com,Daily",
  "DOMAIN-SUFFIX,github.io,Daily",
  "DOMAIN-SUFFIX,github.dev,Daily",
  "DOMAIN-SUFFIX,github.app,Daily",
  "DOMAIN-SUFFIX,github.community,Daily",
  "DOMAIN-SUFFIX,githubstatus.com,Daily",
  "DOMAIN-SUFFIX,ghcr.io,Daily",
  "GEOSITE,github,Daily",
  "DOMAIN-SUFFIX,ebay.com,Shopping",
  "DOMAIN-SUFFIX,ebaystatic.com,Shopping",
  "DOMAIN-SUFFIX,ebayimg.com,Shopping",
  "DOMAIN-SUFFIX,ebayinc.com,Shopping",
  "DOMAIN-SUFFIX,ebaydesc.com,Shopping",
  "DOMAIN-SUFFIX,ebayadservices.com,Shopping",
  "DOMAIN-SUFFIX,ebayrtm.com,Shopping",
  "DOMAIN-SUFFIX,ebay-us.com,Shopping",
  "DOMAIN-SUFFIX,amazon.com,Shopping",
  "DOMAIN-SUFFIX,media-amazon.com,Shopping",
  "DOMAIN-SUFFIX,ssl-images-amazon.com,Shopping",
  "DOMAIN-SUFFIX,images-amazon.com,Shopping",
  "DOMAIN-SUFFIX,amazontrust.com,Shopping",
  "DOMAIN-SUFFIX,amazonpay.com,Shopping",
  "DOMAIN-SUFFIX,amazonvideo.com,Shopping",
  "DOMAIN-SUFFIX,primevideo.com,Shopping",
  "DOMAIN-SUFFIX,51cg1.com,51cg",
  "DOMAIN-SUFFIX,wise.com,Wise/iFast",
  "DOMAIN-SUFFIX,transferwise.com,Wise/iFast",
  "DOMAIN-SUFFIX,wise.jobs,Wise/iFast",
  "DOMAIN-SUFFIX,ifastgb.com,Wise/iFast",
  "DOMAIN-SUFFIX,ifastcorp.com,Wise/iFast",
  "DOMAIN-SUFFIX,ifastnet.com,Wise/iFast",
  "DOMAIN-SUFFIX,ifast.com,Wise/iFast",
  "DOMAIN-SUFFIX,starryblu.com,Wise/iFast",
  "DOMAIN-SUFFIX,starryblu.sg,Wise/iFast",
  "DOMAIN-SUFFIX,starryblu.io,Wise/iFast",
  "GEOSITE,apple,Apple",
  "GEOSITE,microsoft,Microsoft",
  "GEOSITE,private,国内直连",
  "GEOIP,private,国内直连,no-resolve",
  "GEOSITE,cn,国内直连",
  "GEOIP,CN,国内直连,no-resolve",
  "GEOSITE,geolocation-!cn,国外穿墙",
  "MATCH,国外穿墙"
];

// ==== §7 · 主逻辑 ====
function main(config) {
  config = config || {};
  // 开关必须在 main 内现读：Bettbox 在调用 main 之前才注入界面上的选择。
  const opts = (typeof ruleOptionsEnable === "object" && ruleOptionsEnable) || {};
  function opt(key, dft) { return opts[key] === undefined ? dft : !!opts[key]; }

  const proxies = Array.isArray(config.proxies) ? config.proxies : [];
  // 注意：只处理内联 proxies；订阅若用 proxy-providers（节点不在配置里），这里直接原样返回、脚本不生效。
  if (!proxies.length) return config;
  // 重名节点去重：合并多家订阅时可能出现同名节点，同名会让核心报错；后出现的加 " (2)"、" (3)"…
  (function () {
    const seen = {};
    proxies.forEach(function (p) {
      if (!p || typeof p.name !== "string") return;
      let n = p.name, k = 1;
      while (seen["n:" + n]) { k++; n = p.name + " (" + k + ")"; }
      p.name = n;
      seen["n:" + n] = true;
    });
  })();
  const names = proxies.map(function (p) { return p.name; });
  // 信息节点（剩余流量/到期/官网等）单独分区：不进地区组、不占各组默认位，只排在各组末尾备用。
  const realNames = names.filter(function (n) { return !INFO_RE.test(n); });
  const infoNames = names.filter(function (n) { return INFO_RE.test(n); });

  // ---- 地区分组（按节点名归类，一个节点只进第一个命中的地区；v4.6.1 起全手动 select）----
  const regionGroups = [];
  if (opt("地区分组", true)) {
    const assigned = new Set();
    REGION_DEFS.forEach(function (def) {
      const members = realNames.filter(function (n) { return !assigned.has(n) && def[1].test(n); });
      members.forEach(function (n) { assigned.add(n); });
      if (members.length) {
        regionGroups.push({ name: def[0], type: "select", icon: ICON_BASE + def[2], proxies: members });
      }
    });
    const rest = realNames.filter(function (n) { return !assigned.has(n); });
    if (rest.length) {
      regionGroups.push({ name: "其他组", type: "select", icon: ICON_BASE + "WorldMap.svg", proxies: rest });
    }
  }
  const regionNames = regionGroups.map(function (g) { return g.name; });

  // ---- 策略组：手动选择（首选组）/ 地区组 / 20 个服务组 ----
  const groups = [];
  groups.push({ name: "手动选择", type: "select", icon: ICON_BASE + "Static.svg", proxies: regionNames.concat(realNames, infoNames) });
  SERVICE_GROUPS.forEach(function (sg) {
    if (sg.name === "国内直连") {
      regionGroups.forEach(function (rg) { groups.push(rg); });
    }
    // v4.6：before 为空的服务组原本默认落在第一个节点（可能是 Claude 不支持的地区）；
    // 现在默认指向「手动选择」（跟随你日常选的节点），并带上地区组方便单独选；仍可在组内改选任意节点。
    let sgBefore = sg.before.map(function (x) { return x === "自动选择" ? "手动选择" : x; });
    if (DEFAULT_TO_MANUAL && sg.before.length === 0) sgBefore = ["手动选择"].concat(regionNames);
    groups.push({ name: sg.name, type: "select", icon: sg.icon.indexOf("http") === 0 ? sg.icon : ICON_BASE + sg.icon, proxies: sgBefore.concat(realNames, sg.after, infoNames) });
    if (sg.name === "Social" && opt("TikTok分流", false)) {
      groups.push({ name: "TikTok", type: "select", icon: ICON_BASE + "TikTok.svg", proxies: realNames.concat(infoNames) });
    }
  });
  // ---- 拦截选项：每个 select 组末尾加 REJECT（已含 REJECT 的组不重复加；手动选择不加）----
  groups.forEach(function (g) {
    if (g.type === "select" && g.name !== "手动选择" && g.proxies.indexOf("REJECT") === -1) {
      g.proxies.push("REJECT");
    }
  });
  config["proxy-groups"] = groups;

  // ---- 规则：RULES 表（屏蔽国外QUIC 开时在前部插一条；TikTok分流 开时在兜底前插一条）----
  const rules = RULES.slice();
  if (opt("屏蔽国外QUIC", true)) {
    rules.splice(3, 0, QUIC_RULE);
  }
  if (opt("TikTok分流", false)) {
    rules.splice(rules.length - 2, 0, "GEOSITE,tiktok,TikTok");
  }
  config.rules = rules;

  // ---- DNS：fake-ip；每个机场的节点服务器域名各走各自的私有 DoH（见 §3 登记表）----
  const srcDns = config.dns || {};
  // 订阅原 DNS 里出现过的所有字符串，用来优先沿用订阅自带的私有 DoH（令牌以订阅给的为准）。
  const pool = [];
  ["proxy-server-nameserver", "nameserver", "fallback"].forEach(function (k) {
    [].concat(srcDns[k] || []).forEach(function (x) { if (typeof x === "string") pool.push(x); });
  });
  const srcPolicy = srcDns["nameserver-policy"];
  if (srcPolicy && typeof srcPolicy === "object") {
    Object.keys(srcPolicy).forEach(function (k) {
      [].concat(srcPolicy[k] || []).forEach(function (x) { if (typeof x === "string") pool.push(x); });
    });
  }
  function isIpLike(h) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.indexOf(":") !== -1; }
  function hostOf(u) { const m = /^[a-z0-9+.-]+:\/\/\[?([^\/:#?\]]+)/i.exec(u); return m ? m[1].toLowerCase() : ""; }

  // v4.6.1（吹雪云实跑修复）：订阅原配的 proxy-server-nameserver 若全是公共解析，原样保留。
  // 吹雪云的移联入口域名对解析路径敏感：v4.6 把它固定换成单家阿里 DoH 后大面积 timeout，
  // 2026-11-04 单变量实测坐实（改回原配三家 223.5.5.5/119.29.29.29/114.114.114.114 即全通）。
  // 任一条带私有 DoH 特征则不保留、回退脚本默认：特征＝命中登记表的 detect/servers 关键字，
  // 或 URL 路径里带令牌段（/dns-query/ 后面还跟一段长串）。这样合并配置里一家的私有 DoH
  // 不会像 v4.5.2 那样被当成全局 PSN 误连累别家，私有解析仍由下方 policy 按机场分流。
  function isPrivateResolver(u) {
    const s = String(u).toLowerCase();
    let hit = false;
    PRIVATE_DNS.forEach(function (ap) {
      (ap.detect || []).concat(ap.servers || []).forEach(function (kw) {
        if (kw && s.indexOf(String(kw).toLowerCase()) !== -1) hit = true;
      });
    });
    if (hit) return true;
    const m = /^[a-z0-9+.-]+:\/\/[^\/]+(\/[^#]*)?/.exec(s);
    const segs = (m && m[1] ? m[1] : "").split("/").filter(function (x) { return !!x; });
    for (let i = 0; i < segs.length; i++) {
      if (segs[i] !== "dns-query" && segs[i].length >= 10) return true;
    }
    return false;
  }
  const srcPsn = [].concat(srcDns["proxy-server-nameserver"] || []).filter(function (x) { return typeof x === "string" && !!x; });
  const psn = (srcPsn.length && !srcPsn.some(isPrivateResolver)) ? srcPsn.slice() : PSN_DEFAULT.slice();

  const fakeIpFilter = FAKE_IP_FILTER_BASE.slice();
  const dns = {
    enable: true,
    listen: "127.0.0.1:1053",
    ipv6: false,
    "enhanced-mode": "fake-ip",
    "fake-ip-range": "198.18.0.1/15",
    "fake-ip-filter": fakeIpFilter,
    "default-nameserver": DEFAULT_NAMESERVER.slice(),
    "respect-rules": true,
    nameserver: NAMESERVER.slice(),
    "nameserver-policy": {
      "geosite:cn": [CN_DOH],
      "geosite:private": [CN_DOH]
    },
    // 本体：原配 PSN 全为公共解析时沿用原配（见上），否则用脚本默认的普通 DoH；
    // 私有解析只靠下面的 policy 按机场域名分流，未登记的节点不会误用别家的私有 DoH。
    "proxy-server-nameserver": psn
  };
  if (opt("启用登记DoH", true)) {
    const psPolicy = {};
    PRIVATE_DNS.forEach(function (ap) {
      // 1) 这个机场用哪条 DoH：先在订阅原 DNS 里按 detect 关键字找，找不到才用内置兜底。
      let doh = null;
      for (let i = 0; i < pool.length && !doh; i++) {
        for (let j = 0; j < (ap.detect || []).length; j++) {
          if (pool[i].indexOf(ap.detect[j]) !== -1) { doh = pool[i]; break; }
        }
      }
      doh = doh || ap.doh;
      if (!doh) return;
      // 2) 找出属于这个机场的节点服务器域名：先按后缀，再按节点名（可选）。
      const keys = {};
      proxies.forEach(function (p) {
        const srv = p && typeof p.server === "string" ? p.server.toLowerCase() : "";
        if (!srv || isIpLike(srv)) return;
        let hit = false;
        (ap.servers || []).forEach(function (suf) {
          suf = String(suf).toLowerCase();
          if (srv === suf || srv.slice(-(suf.length + 1)) === "." + suf) { keys["+." + suf] = true; hit = true; }
        });
        if (!hit && ap.nameRe && ap.nameRe.test(String(p.name))) keys[srv] = true;
      });
      const ks = Object.keys(keys);
      if (!ks.length) return;
      ks.forEach(function (k) { psPolicy[k] = [doh]; fakeIpFilter.push(k); });
      // 3) 该机场的 DoH 域名本身也要拿真实 IP，不能被 fake-ip 接管。
      const dh = hostOf(doh);
      if (dh && !isIpLike(dh)) fakeIpFilter.push(dh);
    });
    if (Object.keys(psPolicy).length) dns["proxy-server-nameserver-policy"] = psPolicy;
  }
  config.dns = dns;

  // ---- 嗅探：让直连 IP 的流量（Telegram、应用自带 DoH 等）也能还原域名命中域名规则 ----
  config.sniffer = {
    enable: true,
    "force-dns-mapping": true,
    "parse-pure-ip": true,
    sniff: {
      HTTP: { ports: [80, "8080-8880"], "override-destination": true },
      TLS: { ports: [443, 8443] },
      QUIC: { ports: [443, 8443] }
    },
    "skip-domain": SNIFF_SKIP_DOMAIN.slice()
  };

  return config;
}

// ==== 历史纪要（v4.5 起，原文保留，仅作沿革参考）====
// v4.5 变更（2026-11-02，用户拍板）：
//   1) DNS 改用 fake-ip（取代 v3.5 起的 redir-host，用户为隐私性改定）：域名在本机只拿到假 IP、
//      真实解析发生在代理出口，本地不再真实解析被代理域名；fake-ip-filter 放行局域网/NTP/STUN/
//      连通性检测与 +.nowhere-backend.xyz 等必须拿真实 IP 的域名。
//   2) 私有 DoH 改为自动识别：优先从订阅原配置的 DNS 里找出 nowhere-backend.xyz 的私有 DoH 直接沿用，
//      识别不到才回退到脚本内置的 PRIVATE_DOH；policy 仍只限定 +.nowhere-backend.xyz，不连累其他机场。
//   3) 新增「屏蔽国外QUIC」开关（见上）。4) 信息节点关键词表大幅扩充（借鉴 AIsouler 的 excludeFilter）。
//   5) 全部策略组加图标（图标来自 AIsouler/MyClash 仓库 Icons/svg，经 jsdmirror CDN）。
// v4.5 修正（2026-11-02）：Claude 组图标原误用 OpenAI.svg（GPT 的图标），已换成 Simple Icons 的
//   Claude 官方星芒标；注意图标 URL 必须带 .svg 后缀，Bettbox 对无后缀链接不加载（会显示默认图标），
//   故用 jsdelivr 的 simple-icons 源（黑色版星芒标）；其余组不变。
// v4.5.1 变更（2026-11-03）：Doro 的「广港专线」节点（服务器 tengxun.dorocloud.xyz）必须经 Doro 自家
//   私有 DoH（念云）解析，走公共解析会断联——与 Nowhere 高级节点同一病根。故在「nowhere私有DoH」开关
//   下并列新增一条 policy：+.dorocloud.xyz → 优先沿用订阅自带的念云 DoH、识别不到用内置 DORO_DOH 兜底；
//   只锁 dorocloud 域名，其他节点与其他机场不受影响。开关名未改，以免 Bettbox 里已保存的开关选择失效。
// v4.5.2 变更（2026-11-03，用户拍板）：节点域名解析改为「优先保留配置自带」——输出配置的
//   proxy-server-nameserver 原样沿用当前配置自带的值（每个机场的私有 DoH 自动各走各的，不再逐个登记）；
//   配置没带这一项时才用脚本默认的阿里 DoH。此保留不受「nowhere私有DoH」开关控制（开关只管下面两条
//   policy 兜底，合并订阅等场景仍靠 policy 按后缀分流）。v4.5.1 的两条 policy 保留不变。
// v4.6 变更（2026-11-03，用户拍板）：私有 DNS 机场越来越多，要求「每个节点独立走自己对应的私有 DNS」。
//   mihomo 的 DNS 策略只能按域名匹配、没有按节点设置的字段，所以做法是：新增 PRIVATE_DNS 登记表，每个机场一条
//   （节点服务器域名后缀 + 私有 DoH）；脚本扫描 proxies 的 server，命中哪个机场就生成 +.后缀 → 该机场 DoH 的 policy，
//   机场之间互不影响。取消 v4.5.2 的「原样沿用配置自带 proxy-server-nameserver」：合并订阅后配置只带其中一家的值，
//   会让别家节点误用它；现在 proxy-server-nameserver 固定为普通 DoH，私有解析全部走 policy。
//   登记表里的 DoH 仍优先沿用订阅自带的（按 detect 关键字在原 DNS 里找），找不到才用内置兜底；
//   fake-ip-filter 里的机场域名与 DoH 域名也改由登记表自动生成。新增机场只需在 PRIVATE_DNS 里加一条。
//   开关由「nowhere私有DoH」改名为「启用登记DoH」；Bettbox 里原来保存的选择会失效，需重新确认一次（默认开）。
// v4.6 其余修订（按「从大到小」逐条处理）：
//   1) 屏蔽国外QUIC 的 NOT 条件加入 GEOSITE,cn / GEOSITE,private，修正 fake-ip 下国内 QUIC 被误杀；
//   2) 删除 GEOSITE,meta（与 facebook/instagram/whatsapp 及 meta.com 等后缀规则重复，且该类别是否存在未能确认）；
//   3) 删除过宽的第三方通用服务规则：Claude 组的 statsig.com / statsigapi.net / featureassets.org / prodregistryv2.org /
//      sentry.io / intercom.io / intercomcdn.com，OpenAi 组的 featuregates.org / launchdarkly.com / auth0.com /
//      livekit.cloud / ingest.sentry.io（后者本来也被前面的 sentry.io 抢先匹配，是死规则）；它们现在落到 GEOSITE,geolocation-!cn → 国外穿墙；
//   4) 信息节点关键词收窄，避免「备用」「流量」等误伤真实节点；
//   5) before 为空的服务组默认跟随「手动选择」并带地区组（DEFAULT_TO_MANUAL 可关）；
//   6) 清理被更早同组 DOMAIN-SUFFIX 覆盖的冗余规则（行为不变）；7) 节点重名自动加序号；
//   8) Claude 图标固定到 simple-icons@15.0.0；9) 修正过期注释。
// 与 v3.7 的关系：服务组共 20 个，与 v3.7 一一对应（v3.7 的 22 是含手动/自动选择的总组数，服务组本身从未有 22 个）；
// v4.4 按用户通读审阅清单修订：补 sniffer、DNS 监听改 1053、补齐第三个可视化开关、信息节点不再占各组默认位、
// 手动选择不再带 REJECT、地区正则修 \b 边界、删跨组重复规则与误归域名、加 GEOIP,telegram、DNS 加 respect-rules 并改国内 DoH。
// v4.2 结构（用户定版）：无自动选择组；手动选择 = 首选组，日常节点在这里选；
// 国外穿墙首位是手动选择，未命中规则的流量经 MATCH 进国外穿墙后默认落到手动选择选中的节点。
// v4.3 新增：每个 select 策略组末尾统一加 REJECT（拦截）选项——某个服务不想让它联网时，
// 在它对应的服务组里切到 REJECT 即可断网；默认停留项不变。url-test 地区组不加：
// REJECT 混进自动测速组会污染测速与自动选择，拦截应在服务组层面做。WebRtc拦截 本就以 REJECT 开头，不重复加。
