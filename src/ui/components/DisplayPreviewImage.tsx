interface DisplayPreviewImageProps {
  url: string
  /** The logical canvas the design is authored against — the paper's own box. */
  width: number
  height: number
}

/**
 * The host's own render of the payload, painted where the designer's client
 * preview normally is (issue #109, ADR-018 preview seam).
 *
 * It fills the canvas *paper*, so it rides the existing zoom system unchanged
 * (Fit / 50 / 100 / 200%) instead of carrying a second one. `object-contain`
 * rather than a stretch: a host render whose pixel size disagrees with the
 * canvas letterboxes visibly rather than lying about its geometry, and
 * `pixelated` keeps a tag-sized bitmap readable when it is scaled up — the
 * same hard-edged look the designer's own preview has.
 */
export function DisplayPreviewImage({ url, width, height }: DisplayPreviewImageProps) {
  return (
    <img
      data-testid="display-preview-image"
      src={url}
      alt="Host-rendered display preview"
      width={width}
      height={height}
      className="absolute inset-0 h-full w-full bg-white object-contain"
      style={{ imageRendering: 'pixelated' }}
      draggable={false}
    />
  )
}
