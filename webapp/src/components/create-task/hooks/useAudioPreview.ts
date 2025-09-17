export default function useAudioPreview(file: File | null) {
  let url: string | null = null;
  if (file) {
    try {
      url = URL.createObjectURL(file);
    } catch {}
  }
  return {
    url,
    revoke() {
      try { if (url) URL.revokeObjectURL(url); } catch {}
    },
  };
}

