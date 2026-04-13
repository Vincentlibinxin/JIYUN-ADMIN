import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form, Input, Typography, ConfigProvider, theme } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { ApiRequestError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import styles from './AdminLoginPage.module.css';

const { Title, Text } = Typography;

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useI18n();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const formatRetryAfter = (seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainSeconds = safeSeconds % 60;
    if (minutes <= 0) return `${remainSeconds} 秒`;
    return `${minutes} 分 ${remainSeconds} 秒`;
  };

  const handleLogin = async (values: any) => {
    setError('');
    setLoading(true);
    try {
      await login(values.username, values.password);
      navigate('/dashboard');
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        if (err.status === 429) {
          const retryAfterSeconds = Number(err.payload?.retryAfterSeconds || 0);
          const waitText = retryAfterSeconds > 0 ? formatRetryAfter(retryAfterSeconds) : '稍后';
          setError(`${t('login.retryPrefix')}${waitText}${t('login.retrySuffix')}`);
          return;
        }

        if (err.status === 401) {
          setError(t('login.invalidCredentials'));
          return;
        }

        setError(err.message || t('login.failed'));
        return;
      }

      const message = String(err?.message || '').toLowerCase();
      if (message.includes('failed to fetch') || message.includes('network') || message.includes('load failed')) {
        setError(t('login.networkError'));
      } else {
        setError(err.message || t('login.requestFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#f58220',
          fontFamily: '"Space Grotesk", "Noto Sans TC", sans-serif',
          borderRadius: 12,
        },
      }}
    >
      <div className={styles.container}>
        <div className={styles.bgContainer}>
          <div className={styles.bgGradient} />
          <div className={styles.bgPattern} />
          
          {/* Animated contours */}
          <div className={styles.contour1} />
          <div className={styles.contour2} />
          
          {/* Glowing dots */}
          <div className={styles.dot1} />
          <div className={styles.dot2} />
        </div>

        <div className={styles.loginBox}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.logoWrapper}>
              <img 
                src="/logo.png" 
                alt="榕台海峡快运 LOGO" 
                className={styles.logo}
              />
            </div>

            <div style={{ textAlign: 'center' }}>
              <Title level={3} className={styles.title}>
                {t('app.systemTitle')}
              </Title>
              <div className={styles.divider}>
                <div className={styles.dividerGradientLeft} />
                <div className={styles.dividerDot} />
                <div className={styles.dividerLine} />
                <span className={styles.dividerText}>
                  ADMIN PORTAL
                </span>
                <div className={styles.dividerLine} />
                <div className={styles.dividerDot} />
                <div className={styles.dividerGradientRight} />
              </div>
              <Text className={styles.subtitle}>
                RONGTAI ADMINISTRATION SYSTEM
              </Text>
            </div>
          </div>

          {/* Main Form */}
          <Form
            name="admin_login"
            onFinish={handleLogin}
            size="large"
            style={{ width: '100%' }}
          >
            {error && (
              <Form.Item>
                <div style={{
                  padding: '8px 12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  color: '#fca5a5',
                  borderRadius: 12,
                  fontSize: 14,
                  textAlign: 'center'
                }}>{error}</div>
              </Form.Item>
            )}

            <Form.Item
              name="username"
              rules={[{ required: true, message: t('login.usernameRequired') }]}
              style={{ marginBottom: 16 }}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#94a3b8', marginRight: 8, fontSize: 18 }} />}
                placeholder={t('login.username')}
                className={styles.input}
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: t('login.passwordRequired') }]}
              style={{ marginBottom: 24 }}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#94a3b8', marginRight: 8, fontSize: 18 }} />}
                placeholder={t('login.password')}
                className={styles.input}
                iconRender={(visible) => visible
                  ? <EyeOutlined style={{ color: '#64748b', fontSize: 16 }} />
                  : <EyeInvisibleOutlined style={{ color: '#64748b', fontSize: 16 }} />
                }
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                icon={!loading && <LoginOutlined />}
                className={styles.loginBtn}
              >
                {!loading && t('login.submit')}
              </Button>
            </Form.Item>
          </Form>

          {/* Footer */}
          <div className={styles.footer}>
            <Text className={styles.footerText}>
              © 2026 RONGTAI STRAIT EXPRESS
            </Text>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}
