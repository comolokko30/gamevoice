interface NavbarProps {
  available: boolean;
  onDownload: () => void;
  onOpenUpload: () => void;
}

export function Navbar({available, onDownload, onOpenUpload}: NavbarProps) {
  return (
    <header className="border-b border-[#222530] bg-[#090A0D]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
        <a
          href="#"
          className="font-display text-lg font-bold tracking-tight text-[#F5F7FA] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-sm"
        >
          GameVoice
        </a>

        <div className="flex items-center gap-6 shrink-0">
          <button
            type="button"
            onClick={onOpenUpload}
            className="text-sm font-medium text-[#949BB0] hover:text-[#F5F7FA] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Dosya Yükle
          </button>

          {available && (
            <button
              type="button"
              onClick={onDownload}
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-neutral-950 hover:bg-amber-400 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              İndir
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
