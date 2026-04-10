const fs = require('fs');

const content = `import React, { useState } from 'react';
import { Layout, Menu, Dropdown, Button, ConfigProvider } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  DashboardOutlined,
  TeamOutlined,
  ShoppingCartOutlined,
  MessageOutlined,
  CodeSandboxOutlined,
  SafetyCertificateOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../lib/auth';
import styles from './AdminLayout.module.css';

const { Header, Sider, Content } = Layout;

interface AdminLayoutProps {
  children: React.ReactNode;
  activeMenu: string;
  onMenuClick: (key: string) => void;
}

export default function AdminLayout({ children, activeMenu, onMenuClick }: AdminLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [currentLang, setCurrentLang] = useState('zh-CN');
  const { user: adminUser, logout } = useAuth();

  const langMenu = [
    { key: 'zh-CN', label: '中文简体' },
    { key: 'zh-TW', label: '中文繁體' },
    { key: 'en-US', label: 'ENGLISH' },
    { key: 'ms-MY', label: 'Bahasa' },
  ];

  const handleLangChange = (e: any) => {
    setCurrentLang(e.key);
  };

  const currentLangLabel = langMenu.find(item => item.key === currentLang)?.label || 'Language';

  const menuItems = [
    { key: 'overview', icon: <DashboardOutlined />, label: '首頁' },
    { key: 'users', icon: <TeamOutlined />, label: '會員管理' },
    { key: 'orders', icon: <ShoppingCartOutlined />, label: '訂單管理' },
    { key: 'sms', icon: <MessageOutlined />, label: '簡訊資訊' },
    { key: 'parcels', icon: <CodeSandboxOutlined />, label: '包裹管理' },
    { key: 'admins', icon: <SafetyCertificateOutlined />, label: '系統管理員' },
  ];

  const handleLogout = () => {
    logout();
  };

  const userDropdownItems = [
    {
      key: '1',
      icon: <LogoutOutlined />,
      label: '登出',
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <Layout className={styles.layout}>
      {/* 側邊導航欄 - 緊湊模式 */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        theme="dark"
        width={200}
        collapsedWidth={60}
        className={styles.sider}
        style={{
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          background: '#1e293b',
          zIndex: 100
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className={styles.logo}>
              {collapsed ? (
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>RT</span>
              ) : (
                <span style={{ color: '#fff', fontSize: '15px' }}>榕台海峽快運</span>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              <ConfigProvider theme={{ components: { Menu: { darkItemSelectedBg: '#f58220', itemBorderRadius: 8 } } }}>
                <Menu
                  theme="dark"
                  mode="inline"
                  selectedKeys={[activeMenu]}
                  items={menuItems}
                  onClick={({ key }) => onMenuClick(key)}
                  style={{ padding: '0 8px', background: 'transparent', borderRight: 0 }}
                />
              </ConfigProvider>
            </div>
          </div>

          {/* 底部語言切換 - 緊湊模式設計 - 固定在底部 */}
          <div style={{ padding: '16px 8px', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.1)' }}>
            <Dropdown menu={{ items: langMenu, onClick: handleLangChange }} placement="top" trigger={['click']}>
              <div 
                style={{ padding: '8px', cursor: 'pointer', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', borderRadius: 8, transition: 'background 0.3s' }} 
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <GlobalOutlined style={{ fontSize: 16 }} />
                  {!collapsed && <span style={{ fontSize: 13, fontWeight: 500 }}>{currentLangLabel}</span>}
                </div>
              </div>
            </Dropdown>
          </div>
        </div>
      </Sider>

      {/* 主體區域，左側自適應寬度 margin */}
      <Layout style={{ marginLeft: collapsed ? 60 : 200, transition: 'all 0.2s', minHeight: '100vh' }}>
        {/* 頂部導航欄 */}
        <Header className={styles.header}>
          <div className={styles.headerLeft}>
            {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
              className: styles.trigger,
              onClick: () => setCollapsed(!collapsed),
            })}
            <span style={{ fontSize: 16, fontWeight: 600, color: '#333' }}>
              業務管理系統
            </span>
          </div>

          <Dropdown menu={{ items: userDropdownItems }} placement="bottomRight" arrow>
            <div className={styles.userInfo}>
              <div style={{ textAlign: 'right', lineHeight: '1.2' }}>
                 <div className={styles.username}>{adminUser?.username || 'Admin'}</div>
                 <div className={styles.role}>管理員</div>
              </div>
              <UserOutlined style={{ fontSize: '20px', padding: '8px', background: '#f1f5f9', borderRadius: '50%', color: '#64748b' }} />
            </div>
          </Dropdown>
        </Header>

        {/* 核心內容區 */}
        <Content style={{ margin: '24px 16px 0', overflow: 'initial' }}>
           <div style={{ padding: 24, background: '#fff', minHeight: 360, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
             {children}
           </div>
        </Content>
      </Layout>
    </Layout>
  );
}`;

fs.writeFileSync('src/app/layouts/AdminLayout.tsx', content, 'utf8');
console.log('Fixed correctly');