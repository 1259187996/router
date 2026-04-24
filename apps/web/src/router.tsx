import {
  Navigate,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useParams,
} from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/history';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from './components/app-shell';
import { IndexRouteComponent } from './routes/index';
import { ChannelsRouteComponent } from './routes/channels';
import { LogDetailRouteComponent } from './routes/logs.$logId';
import { LogsRouteComponent } from './routes/logs';
import { LoginRouteComponent } from './routes/login';
import { TokensRouteComponent } from './routes/tokens';
import { apiClient, type AppApi } from './lib/api-client';

type RouterApi = Pick<AppApi, 'login' | 'getCurrentUser'> & Partial<Omit<AppApi, 'login' | 'getCurrentUser'>>;
const sessionQueryKey = ['auth', 'me'] as const;

function createSessionQueryOptions(api: RouterApi) {
  return {
    queryKey: sessionQueryKey,
    queryFn: () => api.getCurrentUser(),
    retry: false,
    staleTime: 30_000,
  };
}

function SessionLoading({ label }: { label: string }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] items-center justify-center px-4 py-6">
      <div className="surface-panel rounded-[30px] px-6 py-5 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">Session</p>
        <p className="mt-3 text-sm text-ink-soft">{label}</p>
      </div>
    </div>
  );
}

function RootRouteComponent() {
  return <Outlet />;
}

export function createAppRouter(options?: { api?: RouterApi; history?: RouterHistory }) {
  const api = options?.api ?? apiClient;

  function ShellRouteComponent() {
    const sessionQuery = useQuery(createSessionQueryOptions(api));

    if (sessionQuery.isPending) {
      return <SessionLoading label="正在校验控制台会话..." />;
    }

    if (!sessionQuery.data?.user) {
      return <Navigate to="/login" replace />;
    }

    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  }

  function LoginRouteWrapper() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const sessionQuery = useQuery(createSessionQueryOptions(api));

    if (sessionQuery.isPending) {
      return <SessionLoading label="正在校验登录状态..." />;
    }

    if (sessionQuery.data?.user) {
      return <Navigate to="/" replace />;
    }

    return (
      <LoginRouteComponent
        api={api}
        onAuthenticated={async () => {
          await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
          await navigate({ to: '/' });
        }}
      />
    );
  }

  function LogDetailRouteWrapper() {
    const { logId } = useParams({ strict: false }) as { logId: string };

    return <LogDetailRouteComponent api={api as AppApi} logId={logId} />;
  }

  const rootRoute = createRootRoute({
    component: RootRouteComponent,
  });

  const shellRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'app-shell',
    component: ShellRouteComponent,
  });

  const indexRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: '/',
    component: IndexRouteComponent,
  });

  const channelsRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: '/channels',
    component: () => <ChannelsRouteComponent api={api as AppApi} />,
  });

  const tokensRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: '/tokens',
    component: () => <TokensRouteComponent api={api as AppApi} />,
  });

  const logsRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: '/logs',
    component: () => <LogsRouteComponent api={api as AppApi} />,
  });

  const logDetailRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: '/logs/$logId',
    component: LogDetailRouteWrapper,
  });

  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: LoginRouteWrapper,
  });

  const routeTree = rootRoute.addChildren([
    shellRoute.addChildren([indexRoute, channelsRoute, tokensRoute, logsRoute, logDetailRoute]),
    loginRoute,
  ]);

  return createRouter({
    routeTree,
    history: options?.history,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  });
}

export const router = createAppRouter();

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export function AppRouterProvider() {
  return <RouterProvider router={router} />;
}
