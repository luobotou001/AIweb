import { authClient } from '@/lib/auth-client';

export const useCurrentUser = () => {
  const { data: session, error, isPending } = authClient.useSession();

  // 添加更详细的错误日志
  if (error) {
    console.error('useCurrentUser, error:', {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      name: error?.name,
      fullError: error,
    });
    return null;
  }

  // 如果还在加载中，返回 null 而不是立即返回数据
  if (isPending) {
    return null;
  }

  return session?.user;
};
