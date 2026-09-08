# 安卓模拟器 + Reqable 抓包环境手册（通用方法论）

本手册描述**任意一台 Windows 宿主机 + 安卓模拟器**上，将目标 App（默认森空岛 `com.hypergryph.skland`）的 HTTPS 流量导向 Reqable 并解密抓包的通用流程。所有与环境相关的值都是**参数**：优先用探测命令自动获得，探测不到时向用户询问。已验证的环境实例见文末附录。

## 0. 参数清单与获取方式

| 参数 | 含义 | 自动探测方式 | 探测失败时问用户 |
|---|---|---|---|
| `MUMGR` | 模拟器管理器路径 | 依次试 `D:/MuMuPlayer/nx_main/MuMuManager.exe`、`C:/Program Files/Netease/MuMuPlayer-12.0/nx_main/MuMuManager.exe`、`C:/Program Files/Netease/MuMuPlayer/nx_main/MuMuManager.exe`；或 `tasklist` 找模拟器进程推安装目录 | "模拟器装在哪个目录/什么品牌？" |
| `N` | 模拟器实例号 | 默认 0；多开时问用户 | "抓哪个实例？" |
| `ADB_SERIAL` | adb 设备序列 | `$MUMGR info -v $N` 的 `adb_port` 字段 → `adb connect 127.0.0.1:<port>`，序列即 `127.0.0.1:<port>`（MuMu 12 端口规律 `16384 + 32×N`，但以 info 输出为准） | "adb 端口？" |
| `SDK` | Android API 级别 | `adb shell getprop ro.build.version.sdk` | — |
| `CA_DIR` | 系统 CA 目录 | `SDK ≥ 34`（Android 14+）→ `/apex/com.android.conscrypt/cacerts`；否则 → `/system/etc/security/cacerts`（注：SDK<34 上 conscrypt APEX 也存在但只读不生效，注入 system 路径） | — |
| `ROOT` | root 方式 | `adb shell su -c id` 输出 uid=0 → 直接 `su`；另有 `/data/adb/modules` → KernelSU（可做开机模块持久化） | "模拟器怎么开 root？" |
| `CA_HASH` | Reqable 根证书的 Android 哈希名 | 宿主机 `openssl x509 -in "$APPDATA/Reqable/certificate/reqable-root.crt" -noout -subject_hash_old` | "Reqable CA 证书文件在哪？" |
| `PORT` | Reqable 监听端口 | `netstat -ano | grep LISTENING | grep -E "0\.0\.0\.0:[0-9]+"` 找 Reqable 进程；默认 9000 | "Reqable 端口？" |
| `PROXY_HOST` | 模拟器视角的宿主机地址 | 模拟器内 `ip route`：`10.0.2.x` 网段（QEMU/SLIRP NAT，MuMu/原生 AVD 常见）→ `10.0.2.2`；否则用宿主机局域网 IP（`ipconfig`），桥接网络场景 | — |
| `PKG` | 目标 App 包名 | `adb shell pm list packages | grep <关键词>` | "抓哪个 App？" |

**一次性环境探测**（新环境先跑这个，把输出贴回即可确定全部参数）：

```bash
MUMGR="D:/MuMuPlayer/nx_main/MuMuManager.exe"   # 按上表探测后替换
"$MUMGR" info -v 0 | grep -E '"(adb_port|player_state|is_android_started)"'
PORT=$(netstat -ano | awk '/^  TCP.*0\.0\.0\.0:[0-9]+ .*LISTENING/{print $2}' | cut -d: -f2 | sort -u | head -20)
adb connect 127.0.0.1:16384 && adb devices
ADB=127.0.0.1:16384
adb -s $ADB shell "getprop ro.build.version.sdk; ip route; su -c id"
openssl x509 -in "$APPDATA/Reqable/certificate/reqable-root.crt" -noout -subject_hash_old
```

## 1. 代理设置与连通验证

```bash
# 设置（持久化，模拟器重启保留）
adb -s $ADB shell settings put global http_proxy $PROXY_HOST:$PORT
# 查看 / 取消
adb -s $ADB shell settings get global http_proxy
adb -s $ADB shell settings put global http_proxy :0
```

连通验证（缺一不可）：

1. 宿主机：Reqable 监听必须是 `0.0.0.0:$PORT`（`netstat -ano | findstr :$PORT`）。只听 `127.0.0.1` 时 NAT/局域网流量进不来，需在 Reqable 设置中开启远程访问。
2. 设置代理后无需重启模拟器（OkHttp 等 Java 网络栈立即生效），打开 App 触发流量，Reqable 里应出现记录。
3. 若无记录：模拟器内 `ip route` 确认网段 → 换 `PROXY_HOST` 为宿主机局域网 IP 重试；宿主机防火墙放行 `$PORT`。

## 2. CA 证书注入（解密 HTTPS）

原理：`$CA_DIR` 所在分区只读，用 tmpfs 覆盖该目录并混入 Reqable 根证书。

准备：把 Reqable 根证书推入模拟器并按哈希命名（`$CA_HASH.0`）：

```bash
openssl x509 -in "$APPDATA/Reqable/certificate/reqable-root.crt" -outform PEM -out "$TEMP/$CA_HASH.0"
adb -s $ADB push "$TEMP/$CA_HASH.0" /data/local/tmp/   # 持久保存，重装 Reqable 换证书后需重算哈希重推
```

注入（root 直 su 的环境；`$CA_DIR` 按第 0 节确定）：

```bash
MSYS_NO_PATHCONV=1 adb -s $ADB shell "su -c '
ls /data/local/tmp/$CA_HASH.0 >/dev/null || exit 1
rm -rf /data/local/tmp/cacerts && mkdir -p /data/local/tmp/cacerts
cp $CA_DIR/* /data/local/tmp/cacerts/
cp /data/local/tmp/$CA_HASH.0 /data/local/tmp/cacerts/
mount -t tmpfs -o rw,size=4096k,seclabel tmpfs $CA_DIR
cp /data/local/tmp/cacerts/* $CA_DIR/
chown root:root $CA_DIR/* && chmod 644 $CA_DIR/*
chcon u:object_r:system_security_cacerts_file:s0 $CA_DIR/* 2>/dev/null || chcon u:object_r:system_file:s0 $CA_DIR/*
ls $CA_DIR | wc -l   # 期望 = 原有数量 + 1
'"
```

验证 App 可见（tmpfs 挂载须进入 zygote 挂载命名空间才对 App 生效）：

```bash
MSYS_NO_PATHCONV=1 adb -s $ADB shell "su -c 'grep -c cacerts /proc/\$(pidof zygote64 || pidof zygote)/mounts'"
# ≥1 = 可见。不可见时的兜底：用 nsenter 进入 zygote 命名空间重复 mount，或重启模拟器后在 zygote 起来前注入。
```

**注入后必须 `am force-stop $PKG` 并重启 App**——进程要从新挂载命名空间的 zygote 重新 fork 才信任新证书；只回桌面再点开无效。

持久化选项：

- 无模块体系（普通 su）：tmpfs **模拟器重启即失效**，重跑注入脚本（约 10 秒）。证书原件已在 `/data/local/tmp/` 持久保留，无需重推。
- KernelSU 环境：可做成 `/data/adb/modules/` 开机模块（service.sh 执行同样步骤），一劳永逸。

## 3. Reqable 抓包（MCP 工具）

新 session 确认存在 `mcp__reqable__*` 工具后：

| 操作 | 工具调用 | 说明 |
|---|---|---|
| 开启实时抓包 | `capture_live_set_enabled {enabled: true}` | 会话可能自动停止，长跑前重调 |
| 按 host 过滤（推荐） | `capture_live_filter {filters: [{type: "host", hosts: ["zonai.skland.com"]}]}` | 换 App 时改 host |
| 编目（轻量） | `capture_live_generate_curl {id: <ID>}` | 只含请求行+头，省上下文 |
| 看详情 | `capture_live_get_by_id {id: <ID>}` | 大响应体返回 `encoding:"file"` + 磁盘路径（`%APPDATA%/Reqable/tmp/<uuid>`），直接 `cp` 存档，勿经模型上下文搬运 |
| 存集合留档 | `capture_live_collection_add {id, collectionId}` | |

宿主机本机进程流量会混入（Reqable 开着系统代理），模拟器流量 `application.name` 为模拟器虚拟机进程（MuMu 为 `MuMuVMMHeadless`），按此或按 host 区分。

### 3.1 域名清单（以森空岛为例，抓包前先看这张表）

| 域名 | 归类 | 关注点 |
|---|---|---|
| `zonai.skland.com` | **核心业务 API（唯一）** | 全部 `/api/v1/*` 接口都在这：`user/auth/*`（登录换 cred）、`/user`（含 gameStatus 理智/快照时间）、`/game/player/binding`（多游戏绑定列表）、`/game/player/info`（干员/基建全量快照，**base64 封装**）。App 端特征：UA `Skland/x.x.x ... Okhttp`、`platform: 1`。host 过滤就用它 |
| `game.skland.com` | App 内 WebView（按需） | 游戏数据 H5 页（如 `/arknights/game-data`，hg-account-web-sdk 驱动）；页面内 XHR 与路由可从其 Sentry transaction 里看到 |
| `bbs.hycdn.cn`、`web.hycdn.cn` | CDN 资源（噪音，量大） | 头像/贴纸/emoji/等级图标等静态下载（实测一次会话约 400 条）；URL 只作为业务响应里的引用出现，一般无需抓取 |
| `h.trace.qq.com` | 遥测（噪音+污染源） | 腾讯埋点 `POST /kv`，body 含 `app_name=森空岛`——**keyword 过滤"森空岛/skland"会被它大量污染**，必须按 host 过滤 |
| `sentry.hypergryph.com` | 监控（噪音+污染源） | 鹰角 Sentry，native SDK（`/api/11/envelope/`）与 web SDK（`/api/247/envelope/`，origin 为 game.skland.com）两种形态 |
| `mumu.nie.netease.com` | 模拟器遥测（噪音） | MuMu 自身埋点，body 同样含"森空岛"字样；其他模拟器有各自的遥测域名 |
| agora 声网、推送/IM 长连接网关 | 抓不到（属正常） | 非标端口（如 7001/7004）、WebSocket/私有协议，即使走代理也不必关注 |

两点提醒：

- **遥测是否直连因环境而异**：旧 Android 15 环境中 `h.trace.qq.com`/`sentry` 曾绕过代理直连抓不到；本 Android 12 环境则全部走代理可抓。不要因"抓不到某域名"或"域名陌生"而误判代理故障，先对照本表归类。
- **同 host 的宿主机流量混入**：在宿主机浏览器打开森空岛 Web 版也会产生 `zonai.skland.com` 流量，特征是 `platform: 3`、桌面浏览器 UA、`vname: 1.2.0`、签名头少（无 xsm/wtoken）。用 `application` 字段区分来源（模拟器 = `MuMuVMMHeadless`）。

## 4. 模拟器截图与 UI 操作

```bash
adb -s $ADB exec-out screencap -p > "$TEMP/screen.png"     # 截图，Read 打开查看
adb -s $ADB shell uiautomator dump /data/local/tmp/ui.xml  # UI 元素树
adb -s $ADB shell "cat /data/local/tmp/ui.xml" > "$TEMP/ui.xml"
grep -oE '(text|content-desc)="[^"]+"' "$TEMP/ui.xml" | sort -u
adb -s $ADB shell input tap 540 1591                       # 点击坐标
adb -s $ADB shell cmd package resolve-activity --brief $PKG | tail -1  # 解析启动 Activity
adb -s $ADB shell am start -n <pkg>/<activity>             # force-stop 后残留任务可能启动即退，显式拉起
```

## 5. 故障排查

| 症状 | 原因与处置 |
|---|---|
| App 报 SSL 握手失败 | 证书丢失：模拟器重启后 tmpfs 注入未重做（第 2 节重跑），或 Reqable 换根证书后哈希名变了（重算 `subject_hash_old` 重推） |
| 代理已设但 Reqable 无记录 | `PROXY_HOST` 不对（换局域网 IP）；Reqable 只听 127.0.0.1；宿主机防火墙 |
| 部分流量抓不到 | 先对照 3.1 域名清单归类：声网/推送长连接（非标端口）抓不到属正常；遥测域名是否直连因环境而异，不作为代理故障依据 |
| adb 找不到设备 | `adb kill-server && adb connect 127.0.0.1:<port>`；确认 `"$MUMGR" info -v $N` 的 `player_state: start_finished` |
| 设备侧 grep/解析大输出段错误 | toybox 缺陷：先 `cat` 拉到宿主机再处理，或设备侧 `head` 限流 |
| Git Bash 报 `secure_mkdirs() failed` 或路径错乱 | MSYS 路径转换：整条命令放 `adb shell "..."` 内由设备端解析，或加 `MSYS_NO_PATHCONV=1` |
| 想看原始 TCP | 设备侧 `tcpdump -i any -s 0 -w /data/local/tmp/cap.pcap "tcp port 443"`，回放 `tcpdump -r cap.pcap -nn`（拉到宿主机分析） |

## 6. 收尾

```bash
adb -s $ADB shell settings put global http_proxy :0   # 取消代理恢复直连（CA 注入可保留，不影响正常使用）
```

样本归档到本仓库 `skland_dump/<YYYYMMDD>_capture/`（已 gitignore）：原始响应、解码版、接口编目 CAPTURE_SUMMARY.md；长期凭据（cred/token/wtoken）脱敏后落盘。

## 附录：已验证环境实例

### A. 2026-09-08 · MuMu Player 12 @ D 盘（当前主机）

| 参数 | 值 |
|---|---|
| `MUMGR` | `D:/MuMuPlayer/nx_main/MuMuManager.exe`（MuMu 5.12.0） |
| `ADB_SERIAL` | `127.0.0.1:16384`（**不出现** `emulator-5554`，必须先 connect） |
| `SDK` / `CA_DIR` | 32 / `/system/etc/security/cacerts`（129 系统 CA） |
| `ROOT` | 直接 `su`（无模块体系，重启后需重跑注入） |
| `CA_HASH` | `88fc84bd`（CN "Reqable CA (Aug 12, 2025, 531B9114)"，有效期至 2033） |
| `PORT` / `PROXY_HOST` | 9000 / `10.0.2.2`（wlan0 10.0.2.15，QEMU SLIRP NAT） |
| `PKG` | `com.hypergryph.skland` v1.62.0 (106200040)，启动 Activity `.splash.SplashActivity` |

实测补充：本环境中腾讯埋点 `h.trace.qq.com` 与 Sentry `sentry.hypergryph.com` 均走代理可抓（与附录 B 环境的"直连绕过"结论不同）；CDN `bbs.hycdn.cn` 单次会话约 400 条资源下载。

样本：`skland_dump/20260908_capture/`（player/info 解码快照、binding、登录链路、user+gameStatus）。

### B. 历史 · MuMu @ F 盘，Android 15 + KernelSU（已废弃，仅备忘）

`CA_DIR` 为 `/apex/com.android.conscrypt/cacerts`（145 系统 CA，注入后期望 146）；KernelSU 开机模块 `reqable-ca` 持久注入；代理曾用宿主机局域网 IP `192.168.50.120`；旧证书哈希 `b98cbf90`。该模拟器已不存在，命令序列保留在 git 历史中。

## 其他注意

- **森空岛 App 冷启动可能自行 logout 换 cred**：老 cred 失效时启动即调 `/api/v1/user/auth/logout`，随后经运营商一键登录（`generate_cred_by_code`，body `{"kind":1,"code":"<密文>"}`，cred 头空串）静默换新，期间短暂显示登录页。抓到 logout 不代表登出失败，等几秒再判断。
- MuMu 自身遥测（`mumu.nie.netease.com`）走代理且 body 含中文 App 名，按 keyword 过滤会误匹配，优先按 host 过滤（完整域名归类见 3.1）。
- 基建/线索板等字段语义见 `docs/BUILDING_MOOD_API.md`，可与新抓样本互证。
