import {Check, Copy, Download, ShieldCheck, Upload} from 'lucide-react';
import {useCallback, useEffect, useState} from 'react';
import heroStudioImage from './assets/images/hero_gamevoice_studio_1795472193450.jpg';
import {HostUploadModal} from './components/HostUploadModal';
import {Navbar} from './components/Navbar';
import type {AuthStatus, ReleaseInfo} from './types/release';

const EMPTY_RELEASE: ReleaseInfo = {
  available: false,
  fileName: 'GameVoice.exe',
  sizeBytes: 0,
  sha256: '',
  version: '1.0.0',
  notes: '',
  uploadedAt: null,
  downloadCount: 0,
};

interface PublicReleaseJson {
  fileName?: string;
  version?: string;
  downloadUrl?: string;
  notes?: string;
}

function isSafeDownloadUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('./') || trimmed.startsWith('/')) {
    return !trimmed.startsWith('//');
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${mb.toFixed(2)} MB`;
}

export default function App() {
  const [release, setRelease] = useState<ReleaseInfo>(EMPTY_RELEASE);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    envConfigured: false,
    claimed: false,
    authenticated: false,
  });
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const checkStaticRelease = useCallback(async (): Promise<ReleaseInfo | null> => {
    let config: PublicReleaseJson = {};
    try {
      const jsonRes = await fetch('./release.json');
      const contentType = jsonRes.headers.get('content-type') || '';
      if (jsonRes.ok && contentType.includes('application/json')) {
        config = (await jsonRes.json()) as PublicReleaseJson;
      }
    } catch {
      // ignore missing static release.json
    }

    if (config.downloadUrl && isSafeDownloadUrl(config.downloadUrl)) {
      return {
        available: true,
        fileName: config.fileName || 'GameVoice.exe',
        sizeBytes: 0,
        sha256: '',
        version: config.version || '1.0.0',
        notes: config.notes || '',
        uploadedAt: null,
        downloadCount: 0,
        downloadUrl: config.downloadUrl.trim(),
      };
    }

    const candidateName = (config.fileName || 'GameVoice.exe').replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      const headRes = await fetch(`./${candidateName}`, {method: 'HEAD'});
      const contentType = headRes.headers.get('content-type') || '';
      if (headRes.ok && !contentType.includes('text/html')) {
        const len = Number(headRes.headers.get('content-length') || '0');
        return {
          available: true,
          fileName: candidateName,
          sizeBytes: Number.isFinite(len) ? len : 0,
          sha256: '',
          version: config.version || '1.0.0',
          notes: config.notes || '',
          uploadedAt: null,
          downloadCount: 0,
          downloadUrl: `./${candidateName}`,
        };
      }
    } catch {
      // ignore missing static exe
    }

    return null;
  }, []);

  const fetchReleaseAndAuth = useCallback(async () => {
    try {
      const [releaseRes, authRes] = await Promise.all([
        fetch('./api/release'),
        fetch('./api/auth/status'),
      ]);

      const releaseType = releaseRes.headers.get('content-type') || '';
      if (releaseRes.ok && releaseType.includes('application/json')) {
        setBackendAvailable(true);
        const releaseData = (await releaseRes.json()) as ReleaseInfo;
        if (releaseData.available) {
          setRelease(releaseData);
        } else {
          const staticFallback = await checkStaticRelease();
          setRelease(staticFallback || releaseData);
        }

        const authType = authRes.headers.get('content-type') || '';
        if (authRes.ok && authType.includes('application/json')) {
          const authData = (await authRes.json()) as AuthStatus;
          setAuthStatus(authData);
        }
        return;
      }

      setBackendAvailable(false);
      const staticRelease = await checkStaticRelease();
      setRelease(staticRelease || EMPTY_RELEASE);
    } catch {
      setBackendAvailable(false);
      const staticRelease = await checkStaticRelease();
      setRelease(staticRelease || EMPTY_RELEASE);
    } finally {
      setLoading(false);
    }
  }, [checkStaticRelease]);

  useEffect(() => {
    fetchReleaseAndAuth();
  }, [fetchReleaseAndAuth]);

  function handleDownload() {
    if (!release.available) {
      if (backendAvailable) {
        setUploadModalOpen(true);
      }
      return;
    }

    const href =
      release.downloadUrl && isSafeDownloadUrl(release.downloadUrl)
        ? release.downloadUrl
        : './download/gamevoice.exe';

    const link = document.createElement('a');
    link.href = href;
    link.download = release.fileName || 'GameVoice.exe';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (backendAvailable) {
      window.setTimeout(() => {
        fetchReleaseAndAuth();
      }, 900);
    }
  }

  async function handleCopyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedShareLink(true);
      window.setTimeout(() => setCopiedShareLink(false), 2000);
    } catch {
      // Clipboard fallback ignored if blocked
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#090A0D] text-[#F5F7FA]">
      <Navbar
        available={release.available}
        backendAvailable={backendAvailable}
        onDownload={handleDownload}
        onOpenUpload={() => setUploadModalOpen(true)}
      />

      <main className="flex flex-1 items-center">
        <section className="mx-auto w-full max-w-6xl px-6 py-12 lg:py-16">
          <div className="grid grid-cols-1 items-stretch gap-10 lg:grid-cols-12">
            <div className="flex flex-col justify-center lg:col-span-6">
              <p className="text-xs font-medium text-[#949BB0]">
                Windows 10 &amp; 11 <span aria-hidden="true">·</span> .exe Kurulum Dosyası
              </p>

              <h1
                className="mt-4 font-display font-bold tracking-tight text-[#F5F7FA]"
                style={{
                  fontSize: 'clamp(2.25rem, 4vw, 3.5rem)',
                  lineHeight: 1.08,
                  textWrap: 'balance',
                }}
              >
                GameVoice İndir
              </h1>

              <p className="mt-4 max-w-lg text-base leading-relaxed text-[#A3AABB]">
                Arkadaşlarınla gecikmesiz sesli sohbet için GameVoice masaüstü uygulamasını
                doğrudan indir.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {loading ? (
                  <div className="h-12 w-56 animate-pulse rounded-lg bg-[#161922]" />
                ) : release.available ? (
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex items-center gap-2.5 rounded-lg bg-amber-500 px-6 py-3.5 text-sm font-semibold text-neutral-950 hover:bg-amber-400 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                  >
                    <Download className="h-4 w-4" />
                    <span>GameVoice İndir (.exe)</span>
                  </button>
                ) : backendAvailable ? (
                  <button
                    type="button"
                    onClick={() => setUploadModalOpen(true)}
                    className="inline-flex items-center gap-2.5 rounded-lg bg-amber-500 px-6 py-3.5 text-sm font-semibold text-neutral-950 hover:bg-amber-400 transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                  >
                    <Upload className="h-4 w-4" />
                    <span>.exe Dosyası Yükle</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-2.5 rounded-lg bg-[#1E212B] px-6 py-3.5 text-sm font-semibold text-[#6B7287] whitespace-nowrap shrink-0"
                  >
                    <Download className="h-4 w-4" />
                    <span>Dosya Henüz Eklenmedi</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#252836] bg-[#12141A] px-5 py-3.5 text-sm font-medium text-[#E2E6F0] hover:border-[#373C52] hover:bg-[#181B24] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  {copiedShareLink ? (
                    <>
                      <Check className="h-4 w-4 text-amber-400" />
                      <span>Bağlantı Kopyalandı</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 text-[#949BB0]" />
                      <span>Bağlantıyı Kopyala</span>
                    </>
                  )}
                </button>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#949BB0] tabular-nums">
                {release.available ? (
                  <>
                    <span className="font-mono text-[#E2E6F0]">{release.fileName}</span>
                    {release.sizeBytes > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{formatBytes(release.sizeBytes)}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>Sürüm {release.version}</span>
                    {backendAvailable && release.downloadCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{release.downloadCount} indirme</span>
                      </>
                    )}
                  </>
                ) : backendAvailable ? (
                  <span>
                    Henüz .exe dosyası yüklenmedi. Dosyayı eklemek için yukarıdaki düğmeyi kullan.
                  </span>
                ) : (
                  <span>
                    Dosyayı eklemek için repodaki public/GameVoice.exe dosyasını yükle veya
                    public/release.json içine indirme bağlantısı ekle.
                  </span>
                )}
              </div>

              {release.available && release.notes && (
                <p className="mt-4 text-sm text-[#C2C7D6]">{release.notes}</p>
              )}
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[300px] overflow-hidden rounded-xl border border-[#222530] bg-[#12141A]">
                {!heroImgFailed ? (
                  <img
                    src={heroStudioImage}
                    alt="GameVoice masaüstü oyun ve ses stüdyosu kurulumu"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="h-full w-full object-cover lg:h-full"
                  />
                ) : (
                  <div className="flex h-full min-h-[320px] flex-col items-center justify-center bg-gradient-to-br from-[#141720] to-[#0B0C10] p-8 text-center">
                    <ShieldCheck className="h-10 w-10 text-amber-400" />
                    <p className="mt-3 font-display text-lg font-semibold text-[#F5F7FA]">
                      GameVoice
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#1C1F29] py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 text-xs text-[#6B7287]">
          <span>GameVoice</span>
          {backendAvailable && (
            <button
              type="button"
              onClick={() => setUploadModalOpen(true)}
              className="text-[#949BB0] hover:text-[#F5F7FA] transition-colors cursor-pointer"
            >
              Dosya Yönetimi
            </button>
          )}
        </div>
      </footer>

      <HostUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        release={release}
        authStatus={authStatus}
        token={adminToken}
        onAuthenticated={(newToken) => {
          setAdminToken(newToken);
          setAuthStatus((prev) => ({...prev, claimed: true, authenticated: true}));
        }}
        onReleaseUpdated={(updated) => {
          setRelease(updated);
        }}
      />
    </div>
  );
}
