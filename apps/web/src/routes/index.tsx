import { EmptyState } from '../components/empty-state';
import { PageHeader } from '../components/page-header';

export function IndexRouteComponent() {
  return (
    <div className="space-y-5">
      <span className="sr-only">路由控制台概览</span>
      <PageHeader
        eyebrow="Operator Overview"
        title="Token 使用总览"
        description="运营首页基础骨架。"
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <section className="app-surface rounded-[28px] p-6">
          <h2 className="text-2xl font-semibold tracking-tight text-brand-strong">高消耗用户</h2>
          <div className="mt-5">
            <EmptyState title="暂无内容" description="此区块用于承载高消耗用户概览。" />
          </div>
        </section>

        <section className="app-surface rounded-[28px] p-6">
          <h2 className="text-2xl font-semibold tracking-tight text-brand-strong">渠道健康</h2>
          <div className="mt-5">
            <EmptyState title="暂无内容" description="此区块用于承载渠道健康概览。" />
          </div>
        </section>

        <section className="app-surface rounded-[28px] p-6">
          <h2 className="text-2xl font-semibold tracking-tight text-brand-strong">异常提醒</h2>
          <div className="mt-5">
            <EmptyState title="暂无内容" description="此区块用于承载异常提醒概览。" />
          </div>
        </section>
      </div>
    </div>
  );
}
