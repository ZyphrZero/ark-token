/**
 * 基建技能图标 URL 解析。
 *
 * 数据表里 `buffs[].icon` / `buildingSkills[].icon` 存的是**裸文件名**（如
 * `bskill_pow_spd3.png`），不能直接当 URL 用——Vite 打包会给资源加 hash 并改路径，
 * 硬编码 `/assets/...` 在扩展里会 404。这里用 `import.meta.glob` 在构建期把整个
 * 图标目录登记成「文件名 → 打包后 URL」的映射，运行时按文件名取。
 *
 * 图标由 `npm run build:operator-data` 同步到 assets/building-skills/（529 枚，
 * 有 cwebp 时为 webp、否则原 PNG，扩展名与数据表一致）。
 */
const iconModules = import.meta.glob('../../assets/building-skills/*', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

/** 文件名（含扩展名）→ 打包后 URL */
const iconUrlByName = new Map<string, string>(
  Object.entries(iconModules).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url])
)

/** 技能图标 URL；图标缺失（上游新增未同步）时返回 undefined，调用方应降级不显示 */
export function skillIconUrl(icon: string | undefined): string | undefined {
  return icon ? iconUrlByName.get(icon) : undefined
}
