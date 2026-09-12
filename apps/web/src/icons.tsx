// Inline Font Awesome Free 6 solid glyphs (CC BY 4.0). Inlined rather than loaded
// from the Font Awesome CDN so they render offline and are not subject to the
// site's cross-origin isolation. Path data is verbatim from @fortawesome/fontawesome-free.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

// fa-book-bible — the app's logo mark.
export function BookBibleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 448 512" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M96 0C43 0 0 43 0 96V416c0 53 43 96 96 96H384h32c17.7 0 32-14.3 32-32s-14.3-32-32-32V384c17.7 0 32-14.3 32-32V32c0-17.7-14.3-32-32-32H384 96zm0 384H352v64H96c-17.7 0-32-14.3-32-32s14.3-32 32-32zM208 80c0-8.8 7.2-16 16-16h32c8.8 0 16 7.2 16 16v48h48c8.8 0 16 7.2 16 16v32c0 8.8-7.2 16-16 16H272V304c0 8.8-7.2 16-16 16H224c-8.8 0-16-7.2-16-16V192H160c-8.8 0-16-7.2-16-16V144c0-8.8 7.2-16 16-16h48V80z" />
    </svg>
  );
}

// fa-volume-high — turn volume up.
export function VolumeHighIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 640 512" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M533.6 32.5C598.5 85.2 640 165.8 640 256s-41.5 170.7-106.4 223.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C557.5 398.2 592 331.2 592 256s-34.5-142.2-88.7-186.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM473.1 107c43.2 35.2 70.9 88.9 70.9 149s-27.7 113.8-70.9 149c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C475.3 341.3 496 301.1 496 256s-20.7-85.3-53.2-111.8c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zm-60.5 74.5C434.1 199.1 448 225.9 448 256s-13.9 56.9-35.4 74.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C393.1 284.4 400 271 400 256s-6.9-28.4-17.7-37.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM301.1 34.8C312.6 40 320 51.4 320 64V448c0 12.6-7.4 24-18.9 29.2s-25 3.1-34.4-5.3L131.8 352H64c-35.3 0-64-28.7-64-64V224c0-35.3 28.7-64 64-64h67.8L266.7 40.1c9.4-8.4 22.9-10.4 34.4-5.3z" />
    </svg>
  );
}

// fa-microphone — meeting mic on.
export function MicIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 384 512" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M192 0C139 0 96 43 96 96V256c0 53 43 96 96 96s96-43 96-96V96c0-53-43-96-96-96zM64 216c0-13.3-10.7-24-24-24s-24 10.7-24 24v40c0 89.1 66.2 162.7 152 174.4V464H120c-13.3 0-24 10.7-24 24s10.7 24 24 24h144 144c13.3 0 24-10.7 24-24s-10.7-24-24-24H232V430.4c85.8-11.7 152-85.3 152-174.4V216c0-13.3-10.7-24-24-24s-24 10.7-24 24v40c0 70.7-57.3 128-128 128s-128-57.3-128-128V216z" />
    </svg>
  );
}

// fa-microphone-slash — muted participant.
export function MicOffIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 640 512" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M38.8 5.1C28.4-3.1 13.3-1.2 5.1 9.2S-1.2 34.7 9.2 42.9l592 464c10.4 8.2 25.5 6.3 33.7-4.1s6.3-25.5-4.1-33.7L381.9 274c48.5-19.4 85.1-64.1 92-117.2 2.5-19.8-13.6-36.8-33.6-36.8-16.5 0-30.3 11.9-33.2 27.9C401.4 191.5 365.9 224 324.4 224h-5.6L233.7 148.4C251.9 129.3 264 104.1 264 76.8 264 34.4 229.6 0 187.2 0c-31.2 0-58 18.8-69.5 45.8L38.8 5.1zM162.7 204.7 324.4 332.1c-4.5.6-9.1.9-13.8.9-53 0-96-43-96-96 0-11.4 2-22.3 5.6-32.4zM64 216c0-6.8.7-13.5 2-19.9L22.5 161.4C8.5 177.4 0 197.8 0 220v36c0 89.1 66.2 162.7 152 174.4V496H88c-13.3 0-24 10.7-24 24s10.7 24 24 24h192c13.3 0 24-10.7 24-24s-10.7-24-24-24H216V430.4c24.1-3.3 46.8-11.3 67.2-23.1L90.3 197.1C74.5 200.3 64 207.2 64 216z" />
    </svg>
  );
}

// fa-video — meeting camera on.
export function CamIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 576 512" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M0 128C0 92.7 28.7 64 64 64H320c35.3 0 64 28.7 64 64V384c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V128zM559.1 99.8c10.4 5.6 16.9 16.4 16.9 28.2V384c0 11.8-6.5 22.6-16.9 28.2s-23 5-32.9-1.6l-96-64L416 337.1V320 192 174.9l14.2-9.5 96-64c9.8-6.5 22.4-7.2 32.9-1.6z" />
    </svg>
  );
}

// fa-volume-low — turn volume down.
export function VolumeLowIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 448 512" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M301.1 34.8C312.6 40 320 51.4 320 64V448c0 12.6-7.4 24-18.9 29.2s-25 3.1-34.4-5.3L131.8 352H64c-35.3 0-64-28.7-64-64V224c0-35.3 28.7-64 64-64h67.8L266.7 40.1c9.4-8.4 22.9-10.4 34.4-5.3zM412.6 181.5C434.1 199.1 448 225.9 448 256s-13.9 56.9-35.4 74.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C393.1 284.4 400 271 400 256s-6.9-28.4-17.7-37.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5z" />
    </svg>
  );
}

export function ScreenIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 576 512" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M64 0C28.7 0 0 28.7 0 64V352c0 35.3 28.7 64 64 64H240l-10.7 32H160c-17.7 0-32 14.3-32 32s14.3 32 32 32H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H346.7L336 416H512c35.3 0 64-28.7 64-64V64c0-35.3-28.7-64-64-64H64zM512 64V288H64V64H512z" />
    </svg>
  );
}

export function SpeakerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 640 512" width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M533.6 32.5C598.5 85.2 640 165.8 640 256s-41.5 170.7-106.4 223.5c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C557.5 398.2 592 331.2 592 256s-34.5-142.2-88.7-186.3c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM473.1 107c43.2 35.2 70.9 88.9 70.9 149s-27.7 113.8-70.9 149c-10.3 8.4-25.4 6.8-33.8-3.5s-6.8-25.4 3.5-33.8C475.3 341.3 496 301.1 496 256s-20.7-85.3-53.2-111.8c-10.3-8.4-11.8-23.5-3.5-33.8s23.5-11.8 33.8-3.5zM301.1 34.8C312.6 40 320 51.4 320 64V448c0 12.6-7.4 24-18.9 29.2s-25 3.1-34.4-5.3L131.8 352H64c-35.3 0-64-28.7-64-64V224c0-35.3 28.7-64 64-64h67.8L266.7 40.1c9.4-8.4 22.9-10.4 34.4-5.3z" />
    </svg>
  );
}
