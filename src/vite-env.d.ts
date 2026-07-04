/// <reference types="vite/client" />

declare module '*.module.css';

// china-division 省市区数据（中国大陆）
declare module 'china-division/dist/pca-code.json' {
  interface DivisionArea { code: string; name: string; }
  interface DivisionCity { code: string; name: string; children?: DivisionArea[]; }
  interface DivisionProvince { code: string; name: string; children?: DivisionCity[]; }
  const data: DivisionProvince[];
  export default data;
}

// china-division 港澳台数据：{ 省: { 市: [区...] } }
declare module 'china-division/dist/HK-MO-TW.json' {
  const data: Record<string, Record<string, string[]>>;
  export default data;
}
