/**
 * 职业图标 URL（本地化）。
 *
 * 8 个职业图标（先锋/近卫/重装/狙击/术师/医疗/辅助/特种）从
 * `bbs.hycdn.cn/public/skland-web/image/tool/arknights/assets/profession/white/*.png`
 * 下载后本地化到 assets/professions/（白底已转透明，适配深色面板）。
 * 走 `import.meta.glob`（与 skillIcons.ts 同一套路）：Vite 构建期把目录登记成
 * 「文件名 → 打包后 URL」，运行时按枚举名取，不再有 CDN 依赖。
 *
 * 目录维护：上游图标更新时替换对应 PNG 即可（文件名大小写固定与枚举一致）。
 */
const iconModules = import.meta.glob('../../assets/professions/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

/** 文件名（不含扩展名）→ 打包后 URL */
const iconByBase = new Map<string, string>(
  Object.entries(iconModules).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url])
)

/** 职业枚举 → 本地图标 URL；图标缺失（目录未同步）时返回 undefined */
export function professionIconUrl(professionKey: string | undefined): string | undefined {
  return professionKey ? iconByBase.get(professionKey) : undefined
}
