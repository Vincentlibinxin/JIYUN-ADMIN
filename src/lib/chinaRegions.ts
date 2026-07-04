// 中国大陆省市区 + 港澳台 三级行政区划数据（基于 china-division）。
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

// 加载并构建统一的省/市/区县级联选项（名称作为 value）。
export async function loadChinaRegionOptions(): Promise<RegionCascaderOption[]> {
  if (cachedOptions) return cachedOptions;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const [pcaMod, hmtMod] = await Promise.all([
      import('china-division/dist/pca-code.json'),
      import('china-division/dist/HK-MO-TW.json'),
    ]);
    const pca = pcaMod.default;
    const hmt = hmtMod.default;

    const mainland: RegionCascaderOption[] = pca.map((prov) => ({
      value: prov.name,
      label: prov.name,
      children: mapChildren(prov.children, (city) => ({
        value: city.name,
        label: city.name,
        children: mapChildren(city.children, (area) => ({
          value: area.name,
          label: area.name,
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

// 根据省级名称推导顶层地区（用于电话区号）。
export function regionInfoFromProvince(
  province?: string | null
): { region: 'CN' | 'TW' | 'HK' | 'MO'; dialCode: string } {
  if (province === HK_PROVINCE) return { region: 'HK', dialCode: '+852' };
  if (province === MO_PROVINCE) return { region: 'MO', dialCode: '+853' };
  if (province === TW_PROVINCE) return { region: 'TW', dialCode: '+886' };
  return { region: 'CN', dialCode: '+86' };
}
