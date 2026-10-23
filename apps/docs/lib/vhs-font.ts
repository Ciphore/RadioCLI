import localFont from 'next/font/local';

export const vhsFont = localFont({
  src: '../app/(home)/fonts/VT323-Regular.ttf',
  variable: '--rc-vhs-font',
  weight: '400',
  display: 'swap',
});
