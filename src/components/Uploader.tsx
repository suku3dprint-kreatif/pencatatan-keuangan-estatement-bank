"use client";

import { useCallback, useRef, useState } from "react";

export function Uploader({
  onFiles,
  busy,
  status,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
  status?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const list = files ? Array.from(files) : [];
      if (list.length > 0) onFiles(list);
    },
    [onFiles],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragging
          ? "border-[color:var(--series-1)] bg-[color:var(--gridline)]"
          : "border-hairline bg-surface"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.csv,.txt,.tsv,application/pdf,text/csv"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <p className="text-sm font-medium text-ink">
        {busy ? (status ?? "Memproses…") : "Tarik e-statement ke sini"}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        PDF atau CSV, maksimal 25 MB per file. Bisa <strong>beberapa file sekaligus</strong> —
        misalnya statement beberapa bulan — dan semuanya digabung jadi satu analisa.
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        BSI, Mandiri, BRI/BRImo, BNI, BCA, Jago, SeaBank, blu, Neo — atau format umum lainnya.
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="mt-4 rounded-lg px-4 py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ background: "var(--series-1)" }}
      >
        {busy ? "Memproses…" : "Pilih file"}
      </button>

      {busy ? (
        <div className="mx-auto mt-4 h-1 w-40 overflow-hidden rounded-full bg-[color:var(--gridline)]">
          <div
            className="h-full w-1/3 animate-pulse rounded-full"
            style={{ background: "var(--series-1)" }}
          />
        </div>
      ) : null}

      <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
        File diproses di server aplikasi ini dan tidak disimpan ke disk.
        <br />
        Kalau AI analyzer dinyalakan, <strong>keterangan transaksi</strong> (bukan nomor rekening
        atau namamu) dikirim ke Anthropic API untuk ditebak merchant-nya.
      </p>
    </div>
  );
}
