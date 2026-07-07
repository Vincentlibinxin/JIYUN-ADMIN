// 中国大陆省市区街道 + 港澳台 三级行政区划数据（基于 china-division）。
// 数据体积较大，采用动态 import 按需加载并做进程内缓存。

export interface RegionCascaderOption {
  value: string;
  label: string;
  children?: RegionCascaderOption[];
}

const HK_PROVINCE = '香港特别行政区';
const MO_PROVINCE = '澳门特别行政区';
const TW_PROVINCE = '台湾省';

let cachedOptions: RegionCascaderOption[] | null = null;
let loadingPromise: Promise<RegionCascaderOption[]> | null = null;

const mapChildren = <T,>(
  arr: T[] | undefined,
  fn: (item: T) => RegionCascaderOption
): RegionCascaderOption[] | undefined => {
  if (!arr || arr.length === 0) return undefined;
  return arr.map(fn);
};

// 加载并构建统一的省/市/区县/街道级联选项（名称作为 value）。
export async function loadChinaRegionOptions(): Promise<RegionCascaderOption[]> {
  if (cachedOptions) return cachedOptions;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const [pcasMod, hmtMod] = await Promise.all([
      import('china-division/dist/pcas-code.json'),
      import('china-division/dist/HK-MO-TW.json'),
    ]);
    const pcas = pcasMod.default;
    const hmt = hmtMod.default;

    const mainland: RegionCascaderOption[] = pcas.map((prov) => ({
      value: prov.name,
      label: prov.name,
      children: mapChildren(prov.children, (city) => ({
        value: city.name,
        label: city.name,
        children: mapChildren(city.children, (area) => ({
          value: area.name,
          label: area.name,
          children: mapChildren(area.children, (street) => ({
            value: street.name,
            label: street.name,
          })),
        })),
      })),
    }));

    const extra: RegionCascaderOption[] = Object.entries(hmt).map(([prov, cities]) => ({
      value: prov,
      label: prov,
      children: mapChildren(Object.entries(cities), ([city, districts]) => ({
        value: city,
        label: city,
        children: mapChildren(districts, (d) => ({ value: d, label: d })),
      })),
    }));

    cachedOptions = [...mainland, ...extra];
    return cachedOptions;
  })();
  return loadingPromise;
}

// 判断给定的级联路径是否已选到最小级别（叶子节点）。
// 只有当路径有效且最终节点没有更下一级子节点时才算完整。
export function isRegionPathComplete(
  options: RegionCascaderOption[],
  path?: string[] | null
): boolean {
  if (!path || path.length === 0) return false;
  let level: RegionCascaderOption[] = options;
  let node: RegionCascaderOption | undefined;
  for (const value of path) {
    node = level.find((o) => o.value === value);
    if (!node) return false; // 路径无效
    level = node.children ?? [];
  }
  // 最终节点若仍有子级则表示未选到最小级别
  return !node?.children || node.children.length === 0;
}

// 根据省级名称推导顶层地区（用于电话区号）。
export function regionInfoFromProvince(
  province?: string | null
): { region: 'CN' | 'TW' | 'HK' | 'MO'; dialCode: string } {
  if (province === HK_PROVINCE) return { region: 'HK', dialCode: '+852' };
  if (province === MO_PROVINCE) return { region: 'MO', dialCode: '+853' };
  if (province === TW_PROVINCE) return { region: 'TW', dialCode: '+886' };
  return { region: 'CN', dialCode: '+86' };
}
