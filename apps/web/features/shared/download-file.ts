export function downloadFile(content: Blob, filename: string) {
   const url = URL.createObjectURL(content);
   const link = document.createElement('a');
   link.href = url;
   link.download = filename;
   document.body.appendChild(link);
   link.click();
   link.remove();
   window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
