import {AlertCircle, CheckCircle2, FileCode2, Lock, Trash2, Upload, X} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';
import type {ChangeEvent, DragEvent, FormEvent} from 'react';
import type {AuthStatus, ReleaseInfo} from '../types/release';

interface HostUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  release: ReleaseInfo;
  authStatus: AuthStatus;
  token: string | null;
  onAuthenticated: (newToken: string) => void;
  onReleaseUpdated: (updated: ReleaseInfo) => void;
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${mb.toFixed(2)} MB`;
}

export function HostUploadModal({
  isOpen,
  onClose,
  release,
  authStatus,
  token,
  onAuthenticated,
  onReleaseUpdated,
}: HostUploadModalProps) {
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [version, setVersion] = useState(release.version || '1.0.0');
  const [notes, setNotes] = useState(release.notes || '');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setVersion(release.version || '1.0.0');
      setNotes(release.notes || '');
      setAuthError('');
      setUploadError('');
      setUploadSuccess('');
      setUploadProgress(0);
    }
  }, [isOpen, release.version, release.notes]);

  if (!isOpen) {
    return null;
  }

  const isAuthenticated = Boolean(token);
  const needsSetup = !authStatus.claimed;

  async function handleAuthSubmit(e: FormEvent) {
    e.preventDefault();
    setAuthError('');

    const trimmed = passcode.trim();
    if (trimmed.length < 4) {
      setAuthError('Parola en az 4 karakter olmalıdır.');
      return;
    }

    if (needsSetup && trimmed !== confirmPasscode.trim()) {
      setAuthError('Girilen parolalar eşleşmiyor.');
      return;
    }

    setAuthSubmitting(true);
    try {
      const endpoint = needsSetup ? '/api/auth/setup' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({passcode: trimmed}),
      });
      const data = (await res.json()) as {token?: string; error?: string};
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'Kimlik doğrulama başarısız oldu.');
        return;
      }
      setPasscode('');
      setConfirmPasscode('');
      onAuthenticated(data.token);
    } catch {
      setAuthError('Sunucuya bağlanılamadı.');
    } finally {
      setAuthSubmitting(false);
    }
  }

  function handleFileSelection(file: File | undefined) {
    setUploadError('');
    setUploadSuccess('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.exe')) {
      setUploadError('Lütfen sadece .exe uzantılı bir kurulum dosyası seçin.');
      return;
    }
    setSelectedFile(file);
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    handleFileSelection(e.target.files?.[0]);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelection(e.dataTransfer.files?.[0]);
  }

  function handleUploadSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedFile || !token) return;

    setUploadError('');
    setUploadSuccess('');
    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('version', version.trim() || '1.0.0');
    formData.append('notes', notes.trim());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/release/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        setUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      try {
        const data = JSON.parse(xhr.responseText) as ReleaseInfo & {error?: string};
        if (xhr.status >= 200 && xhr.status < 300) {
          onReleaseUpdated(data);
          setSelectedFile(null);
          setUploadProgress(100);
          setUploadSuccess(
            `${data.fileName} başarıyla yüklendi. Sayfa bağlantısını arkadaşınla paylaşabilirsin.`,
          );
        } else {
          setUploadError(data.error || 'Yükleme sırasında bir hata oluştu.');
        }
      } catch {
        setUploadError('Sunucu yanıtı işlenemedi.');
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setUploadError('Ağ hatası nedeniyle dosya yüklenemedi.');
    };

    xhr.send(formData);
  }

  async function handleRemoveRelease() {
    if (!token) return;
    setDeleting(true);
    setUploadError('');
    setUploadSuccess('');
    try {
      const res = await fetch('/api/release', {
        method: 'DELETE',
        headers: {Authorization: `Bearer ${token}`},
      });
      const data = (await res.json()) as ReleaseInfo & {error?: string};
      if (!res.ok) {
        setUploadError(data.error || 'Dosya kaldırılamadı.');
        return;
      }
      onReleaseUpdated(data);
      setUploadSuccess('Mevcut .exe dosyası sunucudan kaldırıldı.');
    } catch {
      setUploadError('Sunucuya bağlanılamadı.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="host-upload-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-[#252836] bg-[#12141A] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#222530] pb-4">
          <div>
            <h2
              id="host-upload-title"
              className="font-display text-xl font-semibold tracking-tight text-[#F5F7FA]"
            >
              {isAuthenticated ? 'GameVoice .exe Dosyasını Yükle' : 'Dosya Sahibi Doğrulaması'}
            </h2>
            <p className="mt-1 text-sm text-[#949BB0]">
              {isAuthenticated
                ? 'Arkadaşının indireceği gerçek .exe dosyasını buradan sunucuya yükle.'
                : needsSetup
                  ? 'İlk kurulum: Dosya yükleme alanını korumak için bir yönetici parolası belirle.'
                  : 'Yeni bir .exe dosyası yüklemek veya değiştirmek için yönetici parolanı gir.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="rounded-lg p-2 text-[#949BB0] hover:bg-white/5 hover:text-[#F5F7FA] transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!isAuthenticated ? (
          <form onSubmit={handleAuthSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="host-passcode"
                className="block text-sm font-medium text-[#E2E6F0]"
              >
                {needsSetup ? 'Yeni Yönetici Parolası' : 'Yönetici Parolası'}
              </label>
              <div className="relative mt-1.5">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7287]" />
                <input
                  id="host-passcode"
                  type="password"
                  required
                  minLength={4}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="En az 4 karakter"
                  className="w-full rounded-lg border border-[#252836] bg-[#090A0D] py-2.5 pl-10 pr-3 text-sm text-[#F5F7FA] placeholder-[#5B6275] focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {needsSetup && (
              <div>
                <label
                  htmlFor="host-passcode-confirm"
                  className="block text-sm font-medium text-[#E2E6F0]"
                >
                  Parolayı Onayla
                </label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7287]" />
                  <input
                    id="host-passcode-confirm"
                    type="password"
                    required
                    minLength={4}
                    value={confirmPasscode}
                    onChange={(e) => setConfirmPasscode(e.target.value)}
                    placeholder="Parolayı tekrar gir"
                    className="w-full rounded-lg border border-[#252836] bg-[#090A0D] py-2.5 pl-10 pr-3 text-sm text-[#F5F7FA] placeholder-[#5B6275] focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {authError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#252836] px-4 py-2.5 text-sm font-medium text-[#C2C7D6] hover:bg-white/5 transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={authSubmitting}
                className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-60 transition-colors cursor-pointer"
              >
                {authSubmitting
                  ? 'Doğrulanıyor...'
                  : needsSetup
                    ? 'Parolayı Kaydet ve Devam Et'
                    : 'Giriş Yap'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleUploadSubmit} className="mt-5 space-y-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors cursor-pointer ${
                isDragging
                  ? 'border-amber-400 bg-amber-500/10'
                  : 'border-[#2E3242] bg-[#090A0D] hover:border-amber-500/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".exe"
                onChange={handleFileInputChange}
                className="hidden"
              />
              {selectedFile ? (
                <div className="flex flex-col items-center">
                  <FileCode2 className="h-8 w-8 text-amber-400" />
                  <p className="mt-2 font-mono text-sm font-medium text-[#F5F7FA]">
                    {selectedFile.name}
                  </p>
                  <p className="mt-1 font-mono text-xs text-[#949BB0] tabular-nums">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <Upload className="h-8 w-8 text-[#949BB0]" />
                  <p className="mt-2 text-sm font-medium text-[#F5F7FA]">
                    GameVoice .exe dosyasını buraya sürükle veya seç
                  </p>
                  <p className="mt-1 text-xs text-[#6B7287]">
                    Sadece .exe dosyaları desteklenir (maks. 500 MB)
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="release-version"
                  className="block text-xs font-medium text-[#C2C7D6]"
                >
                  Sürüm Numarası
                </label>
                <input
                  id="release-version"
                  type="text"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="1.0.0"
                  maxLength={32}
                  className="mt-1.5 w-full rounded-lg border border-[#252836] bg-[#090A0D] px-3 py-2 font-mono text-sm text-[#F5F7FA] focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="release-notes"
                  className="block text-xs font-medium text-[#C2C7D6]"
                >
                  Arkadaşına Not (İsteğe Bağlı)
                </label>
                <input
                  id="release-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Örn: İndirip açman yeterli"
                  maxLength={140}
                  className="mt-1.5 w-full rounded-lg border border-[#252836] bg-[#090A0D] px-3 py-2 text-sm text-[#F5F7FA] focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {uploading && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#949BB0]">
                  <span>Sunucuya yükleniyor...</span>
                  <span className="font-mono tabular-nums">{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#222530]">
                  <div
                    className="h-full bg-amber-500 transition-all duration-150"
                    style={{width: `${uploadProgress}%`}}
                  />
                </div>
              </div>
            )}

            {uploadError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {uploadSuccess && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{uploadSuccess}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              {release.available ? (
                <button
                  type="button"
                  disabled={deleting || uploading}
                  onClick={handleRemoveRelease}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{deleting ? 'Kaldırılıyor...' : 'Mevcut Dosyayı Sil'}</span>
                </button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-[#252836] px-4 py-2 text-sm font-medium text-[#C2C7D6] hover:bg-white/5 transition-colors cursor-pointer"
                >
                  Kapat
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || uploading}
                  className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {uploading ? 'Yükleniyor...' : 'Dosyayı Yayınla'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
