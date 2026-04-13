import React, { useState } from 'react';
import { Layout, Menu, Dropdown, ConfigProvider, Breadcrumb, Button, Tooltip } from 'antd';
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
  ReloadOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useAuth } from '../../lib/auth';
import { useI18n, type LangCode } from '../../lib/i18n';
import styles from './AdminLayout.module.css';

const { Header, Sider, Content } = Layout;

interface AdminLayoutProps {
  children: React.ReactNode;
  activeMenu: string;
  onMenuClick: (key: string) => void;
  onRefresh?: () => void;
}

export default function AdminLayout({ children, activeMenu, onMenuClick, onRefresh }: AdminLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { user: adminUser, logout } = useAuth();
  const { lang, setLang, t } = useI18n();

  const langOptions: Array<{ key: LangCode; label: string }> = [
    { key: 'zh-CN', label: t('lang.simplifiedChinese') },
    { key: 'zh-TW', label: t('lang.traditionalChinese') },
    { key: 'en-US', label: t('lang.english') },
    { key: 'id-ID', label: t('lang.indonesian') },
  ];
  const langMenu: MenuProps['items'] = langOptions.map((item) => ({
    key: item.key,
    label: item.label,
  }));

  const handleLangChange: MenuProps['onClick'] = ({ key }) => {
    setLang(key as LangCode);
  };

  const currentLangLabel = langOptions.find((item) => item.key === lang)?.label || 'Language';

  const menuItems = [
    { key: 'overview', icon: <DashboardOutlined />, label: t('menu.overview') },
    { key: 'users', icon: <TeamOutlined />, label: t('menu.users') },
    { key: 'orders', icon: <ShoppingCartOutlined />, label: t('menu.orders') },
    { key: 'sms', icon: <MessageOutlined />, label: t('menu.sms') },
    { key: 'parcels', icon: <CodeSandboxOutlined />, label: t('menu.parcels') },
    { key: 'admins', icon: <SafetyCertificateOutlined />, label: t('menu.admins') },
  ];

  const handleLogout = () => {
    logout();
  };

  const userDropdownItems = [
    {
      key: '1',
      icon: <LogoutOutlined />,
      label: t('app.logout'),
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <Layout className={styles.layout} style={{ borderRadius: 0 }}>
      {/* 側邊導航欄 - 緊湊模式 */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        theme="dark"
        width={180}
        collapsedWidth={56}
        className={styles.sider}
        style={{
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          borderRadius: 0
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className={styles.logo}>
              {collapsed ? (
                <span style={{ fontSize: '20px', fontWeight: 'bold' }}>CMS</span>
              ) : (
                <span style={{ color: '#fff', fontSize: '20px', fontWeight: 700 }}>CMS跨境系统</span>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              <ConfigProvider theme={{ components: { Menu: { darkItemSelectedBg: '#f58220', itemBorderRadius: 0, itemHeight: 36, itemMarginBottom: 2 } } }}>
                <Menu
                  className={styles.sideMenu}
                  theme="dark"
                  mode="inline"
                  selectedKeys={[activeMenu]}
                  items={menuItems}
                  onClick={({ key }) => onMenuClick(key)}
                  style={{ padding: 0, background: 'transparent', borderRight: 0 }}
                />
              </ConfigProvider>
            </div>
          </div>

          {/* 底部語言切換 - 緊湊模式設計 - 固定在底部 */}
          <div style={{ padding: '6px', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.1)' }}>
            <Dropdown menu={{ items: langMenu, onClick: handleLangChange }} placement="top" trigger={['click']}>
              <div 
                style={{ padding: '6px 8px', cursor: 'pointer', color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', borderRadius: 8, transition: 'background 0.3s' }} 
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
      <Layout style={{ marginLeft: collapsed ? 56 : 180, transition: 'all 0.2s', height: '100vh', overflow: 'hidden', borderRadius: 0 }}>
        {/* 頂部導航欄 */}
        <Header className={styles.header} style={{ height: 45, lineHeight: '45px', padding: '0 24px' }}>
          <div className={styles.headerLeft}>
            {React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
              className: styles.trigger,
              onClick: () => setCollapsed(!collapsed),
            })}
            <Breadcrumb
              style={{ display: 'inline-block', lineHeight: '45px', marginLeft: 16 }}
              items={[
                { title: menuItems.find(item => item.key === activeMenu)?.label || activeMenu }
              ]}
            />
            <Tooltip title="刷新">
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => onRefresh?.()}
                style={{ marginLeft: 8, verticalAlign: 'middle' }}
              />
            </Tooltip>
          </div>

          <Dropdown menu={{ items: userDropdownItems }} placement="bottomRight" arrow>
            <div className={styles.userInfo}>
              <div style={{ textAlign: 'right', lineHeight: '1.2' }}>
                 <div className={styles.username}>{adminUser?.username || 'Admin'}</div>
                  <div className={styles.role}>{t('app.admin')}</div>
              </div>
              <UserOutlined style={{ fontSize: '20px', padding: '8px', background: '#f1f5f9', borderRadius: '50%', color: '#64748b' }} />
            </div>
          </Dropdown>
        </Header>

        {/* 核心內容區 */}
        <Content style={{ margin: '8px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
           <div style={{ flex: 1, minHeight: 0, padding: 0, background: '#fff', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
             {children}
           </div>
        </Content>
      </Layout>
    </Layout>
  );
}