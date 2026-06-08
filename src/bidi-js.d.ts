declare module 'bidi-js' {
  interface BidiEmbeddingLevels {
    paragraphs: Array<{ level: number }>
  }

  interface Bidi {
    getEmbeddingLevels(text: string): BidiEmbeddingLevels
    getReorderedString(text: string, embedding: BidiEmbeddingLevels): string
  }

  export default function bidiFactory(): Bidi
}
