import { Skeleton } from '@/components/common/Skeleton';

export function FlagshipSkeleton() {
  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <Skeleton className="h-8 w-48" />
      <div className="glass-card p-6">
        <div className="flex flex-col sm:flex-row gap-6">
          <Skeleton className="h-48 w-48 rounded-xl flex-shrink-0 mx-auto sm:mx-0" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-32" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
