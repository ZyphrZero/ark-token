# MuMu 模拟器 + Reqable 抓包环境手册

本手册记录如何将 MuMu 模拟器中的森空岛 App（`com.hypergryph.skland`）的 HTTPS 流量导向 Reqable 代理并解密，以及如何操作模拟器（截图、UI 分析）。供任何 ZCode session 或人工照做。

## 环境清单

| 项 | 值 |
|---|---|
| 宿主机（Windows）IP | `192.168.50.120`（DHCP 分配，变更后需更新模拟器代理设置） |
| Reqable 监听 | `0.0.0.0:9000`（桌面版；MCP 工具名前缀 `mcp__reqable__`） |
| 模拟器 | MuMu Player 实例 0，`F:\MuMuPlayer\nx_main\MuMuNxMain.exe` |
| adb 序列 | `emulator-5554`（等价 `127.0.0.1:16384`） |
| Android 版本 | 15（x86_64 系统，arm64 应用经 Houdini/native bridge 运行） |
| root | KernelSU（`/data/adb/ksud`，ksud 3.2.5），`adb root` 直接可用 |
| 目标 App | 森空岛 `com.hypergryph.skland` v1.62.0（versionCode 106200040） |

模拟器状态查询：`"F:/MuMuPlayer/nx_main/MuMuManager.exe" info -v 0`（关注 `player_state: start_finished`）。

## 1. 代理设置

```bash
# 设置全局代理（持久化，重启保留）
adb -s emulator-5554 shell settings put global http_proxy 192.168.50.120:9000

# 查看
adb -s emulator-5554 shell settings get global http_proxy

# 取消代理（恢复直连）
adb -s emulator-5554 shell settings put global http_proxy :0
```

设置后无需重启模拟器，Java 层网络栈（OkHttp 等）立即生效。森空岛的 REST API 层（`zonai.skland.com` 等）走此代理；部分遥测组件绕过代理直连（见"已知坑"）。

## 2. HTTPS 解密证书（Reqable CA 注入）

Android 15 上应用只信任 conscrypt APEX 内的系统 CA（`/system` 只读，无法直接写入），方案是用 tmpfs 覆盖该目录并混入 Reqable 根证书。

**已部署持久化方案**：KernelSU 开机模块 `reqable-ca`（位于模拟器 `/data/adb/modules/reqable-ca/`），每次开机自动执行注入，已通过重启实测验证。正常情况下无需任何手动操作。

**验证证书在位**（App 报 SSL 握手失败时先查这里）：

```bash
adb -s emulator-5554 shell ls -laZ /apex/com.android.conscrypt/cacerts/b98cbf90.0
# 应显示 146 个证书（145 系统原生 + 1 Reqable），标签 u:object_r:system_security_cacerts_file:s0
adb -s emulator-5554 shell ls /apex/com.android.conscrypt/cacerts/ | wc -l
```

**手动注入**（模块失效时的兜底；证书原件持久保留在模拟器 `/data/local/tmp/b98cbf90.0`，宿主机源文件在 `%APPDATA%\Reqable\certificate\reqable-root.crt`，subject_hash_old = `b98cbf90`）：

```bash
adb -s emulator-5554 shell '
set -e
ls /data/local/tmp/b98cbf90.0 >/dev/null
rm -rf /data/local/tmp/cacerts && mkdir -p /data/local/tmp/cacerts
cp /apex/com.android.conscrypt/cacerts/* /data/local/tmp/cacerts/
cp /data/local/tmp/b98cbf90.0 /data/local/tmp/cacerts/
mount -t tmpfs -o rw,seclabel tmpfs /apex/com.android.conscrypt/cacerts
cp /data/local/tmp/cacerts/* /apex/com.android.conscrypt/cacerts/
chown root:root /apex/com.android.conscrypt/cacerts/*
chmod 644 /apex/com.android.conscrypt/cacerts/*
chcon u:object_r:system_security_cacerts_file:s0 /apex/com.android.conscrypt/cacerts/*
ls /apex/com.android.conscrypt/cacerts/ | wc -l   # 期望 146
'
```

注入在 tmpfs 中进行，KernelSU 模块负责开机重建；若手动执行过一次，同轮开机内不要重复执行（脚本有幂等判断）。

## 3. Reqable 抓包操作（MCP）

新 session 需确认有 `mcp__reqable__*` 工具，然后：

| 操作 | 工具调用 |
|---|---|
| 开启实时抓包 | `capture_live_set_enabled {enabled: true}` |
| 按关键字过滤 | `capture_live_filter {filters: [{type: "keyword", pattern: "skland"}]}` |
| 按 host 过滤 | `capture_live_filter {filters: [{type: "host", hosts: ["zonai.skland.com"]}]}` |
| 查看请求详情（含解密后的请求头/响应体） | `capture_live_get_by_id {id: <记录ID>}` |
| 存入集合留档 | `capture_live_collection_add {id: <记录ID>, collectionId: <集合ID>}` |

注意：live capture 会话可能自动停止，长时间使用前重新调用 `capture_live_set_enabled`。Reqable 同时开着 Windows 系统代理，记录里会混入宿主机本机进程（如游戏反作弊）流量，按 `application` 字段或 host 过滤即可区分；来自模拟器的流量 `connection.local` 显示为宿主机 IP/回环。

## 4. 获取模拟器截图与 UI

```bash
# 截屏到本地（PNG）
adb -s emulator-5554 exec-out screencap -p > "$TEMP/screen.png"

# UI 元素树（文本、控件、坐标，用于定位按钮）
adb -s emulator-5554 shell uiautomator dump /data/local/tmp/ui.xml
adb -s emulator-5554 shell "cat /data/local/tmp/ui.xml" > "$TEMP/ui.xml"
grep -oE '(text|content-desc)="[^"]+"' "$TEMP/ui.xml" | sort -u

# 点击坐标
adb -s emulator-5554 shell input tap 540 1591
```

截图用 Read 工具打开 PNG 查看；或经 analyze_image 类图像工具识别内容。

## 5. 已知坑（必读）

1. **Git Bash 路径转换**：adb 命令中以 `/` 开头的参数（如 `/data/local/tmp/...`）会被 MSYS 转成 Windows 路径导致 `secure_mkdirs() failed`。解决：命令前加 `MSYS_NO_PATHCONV=1`，或把整条命令放进 `adb shell '...'` 单引号内由设备端 shell 解析，或用 `//data/...` 双斜杠。
2. **设备侧 grep 大输出会 segfault**：MuMu 的 toybox grep 处理大文件（uiautomator dump 的 XML、长 logcat）会段错误。解决：先 `cat` 拉到宿主机再 grep，或在设备侧用 `head` 限制输出量。
3. **App 绕过代理的直连组件**（抓不到，属正常）：腾讯埋点 `h.trace.qq.com`、鹰角 Sentry `sentry.hypergryph.com`、声网 agora、推送/长连接网关（非标端口 7001/7004）。核心 REST API（`zonai.skland.com`，UA `Skland/1.62.0 ... Okhttp/4.11.0`）走代理可完整解密，含 `sign`/`wtoken`/`xsm` 签名头。
4. **模拟器重启后的状态**：代理设置保留（settings 持久）、证书由 KernelSU 模块自动注入（约开机后 30 秒内就位）、常驻 tcpdump 监听会消失需重开、adb 可能需 `adb kill-server && adb connect 127.0.0.1:16384` 修复 offline。
5. **App 报 SSL 握手失败** = 证书丢了（大概率模拟器异常重启导致模块未跑），按第 2 节验证并手动注入。
6. **宿主机 IP 变化**（DHCP 续租/换网）：`ipconfig` 核对后重设代理，并确认 Reqable 仍监听 9000（`netstat -ano | findstr :9000`）。
7. **诊断利器**：设备自带 `/system/bin/tcpdump`。例：`tcpdump -i any -s 0 -w /data/local/tmp/cap.pcap "tcp port 443"`，回放用 `tcpdump -r cap.pcap -nn`（输出拉到本地分析，见坑 2）。

## 6. 本次部署产物位置汇总

| 产物 | 位置 |
|---|---|
| KernelSU 开机注入模块 | 模拟器 `/data/adb/modules/reqable-ca/`（module.prop + service.sh + system/etc/security/cacerts/b98cbf90.0） |
| Reqable CA 证书（Android 命名） | 模拟器 `/data/local/tmp/b98cbf90.0`（持久） |
| Reqable CA 源证书 | 宿主机 `C:\Users\Administrator\AppData\Roaming\Reqable\certificate\reqable-root.crt` |
| 证书手工注入脚本 | 模拟器 `/data/adb/modules/reqable-ca/service.sh`（可直接执行） |
| 历史抓包分析 | 本仓库 `skland_dump/`（SKLAND_CAPTURE_SUMMARY.md、CAPTURE_STATUS.txt 等） |
