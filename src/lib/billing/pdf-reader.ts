export async function extractInvoiceTextFromPdf(file: File) {
  const pdfjs = await import("pdfjs-dist")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const document = await loadingTask.promise
  const pages: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const fragments = content.items.flatMap((item) => {
        if (!("str" in item) || !("transform" in item) || !item.str.trim()) return []
        return [{ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }]
      })
      const sortedFragments = fragments.sort((left, right) => {
        if (Math.abs(right.y - left.y) > 4) return right.y - left.y
        return left.x - right.x
      })
      const lines: { y: number; fragments: typeof sortedFragments }[] = []

      for (const fragment of sortedFragments) {
        const line = lines.find((candidate) => Math.abs(candidate.y - fragment.y) <= 4)
        if (line) line.fragments.push(fragment)
        else lines.push({ y: fragment.y, fragments: [fragment] })
      }

      pages.push(
        lines
          .sort((left, right) => right.y - left.y)
          .map((line) =>
            line.fragments
              .sort((left, right) => left.x - right.x)
              .map(({ text }) => text)
              .join(" "),
          )
          .join("\n"),
      )
      page.cleanup()
    }
    return pages.join("\n")
  } finally {
    await loadingTask.destroy()
  }
}
