// src/app/loading.tsx — Global route transition loader
export default function GlobalLoading() {
  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0E0904] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-[#B8935A] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400 font-medium tracking-wide">Loading…</p>
      </div>
    </div>
  );
}
