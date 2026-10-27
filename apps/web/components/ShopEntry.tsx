// Store entrance, once per visit (any page you land on): the shop front with its lit sign and glass double doors.
// The doors swing open by themselves and you walk in (the scene grows and fades). Pure CSS (.entry-* in globals.css)
// so it plays before React loads. The inline script skips it for the rest of the session and for reduced motion.
// It never blocks clicks.
export default function ShopEntry() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: "try{if(!window.fsEntry){window.fsEntry=1;if(sessionStorage.fsIn||matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.dataset.in='1';sessionStorage.fsIn='1'}}catch(e){}" }} />
      <div className="shop-entry" aria-hidden>
        <div className="entry-scene">
          <div className="entry-fascia">
            <span className="display sign-lit text-[clamp(2rem,6vw,4rem)] leading-none">Fit Secrets<span className="text-brand">.</span></span>
          </div>
          <div aria-hidden className="awning entry-awning" />
          <div className="entry-doorway">
            <div className="entry-inside" />
            <div className="entry-door entry-door-l">
              <span className="open-sign entry-open"><span className="open-dot" /> OPEN</span>
              <span className="entry-handle-v right-3" />
            </div>
            <div className="entry-door entry-door-r">
              <span className="entry-hours">Walk in</span>
              <span className="entry-handle-v left-3" />
            </div>
          </div>
          <div className="entry-step"><span className="doormat">Welcome</span></div>
        </div>
      </div>
    </>
  );
}
