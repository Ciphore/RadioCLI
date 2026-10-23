const modes = [
  { name: 'Full', image: '/demo/radiocli-layout-full.png', width: 1280, height: 760 },
  { name: 'Compact', image: '/demo/radiocli-layout-compact.png', width: 700, height: 588 },
  { name: 'Micro', image: '/demo/radiocli-layout-micro-large.png', width: 360, height: 374 },
];

export function TerminalLayoutDemo() {
  return <div className="rc-layout-comparison">
    {modes.map(mode => <figure key={mode.name} data-mode={mode.name.toLowerCase()}>
      <div className="rc-layout-preview"><img src={mode.image} width={mode.width} height={mode.height}
        alt={`RadioCLI’s ${mode.name.toLowerCase()} Now Playing layout`} loading="lazy" /></div>
      <figcaption>{mode.name}</figcaption>
    </figure>)}
  </div>;
}
