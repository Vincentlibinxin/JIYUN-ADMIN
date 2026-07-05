/// <reference types="vite/client" />

declare module '*.module.css';

// china-division 省市区街道数据（中国大陆）
declare module 'china-division/dist/pcas-code.json' {
  interface DivisionStreet { code: string; name: string; }
  interface DivisionArea { code: string; name: string; children?: DivisionStreet[]; }
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
