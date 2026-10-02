import { useEffect, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleAlert, LockKeyhole, Menu, X } from 'lucide-react';
import {
  getGetAdminSessionQueryKey,
  getGetAdminSummaryQueryKey,
  getListAdminSubmissionsQueryKey,
  useAdminLogin,
  useAdminLogout,
  useGetAdminSession,
  useGetAdminSummary,
  useGetPublicConfig,
  useListAdminSubmissions,
  useSubmitBuyer,
  useSubmitProvider,
  useUpdateAdminSubmission,
} from '@workspace/api-client-react';
import type { AdminSubmission, BuyerSubmissionInput, SubmissionStatus, SubmissionType } from '@workspace/api-client-react';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const statuses: SubmissionStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'MATCHED', 'CLOSED', 'REJECTED'];
const timelineOptions = ['Inmediatamente', '1–3 meses', '3–6 meses', 'Más de 6 meses'];
const budgetOptions = ['Menos de COP $50M', 'COP $50M–$100M', 'COP $100M–$500M', 'COP $500M–$1.000M', 'Más de COP $1.000M', 'No definido'];

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    const message = error.message;
    if (message.length < 250 && !message.toLowerCase().includes('fetch')) return message;
  }
  return fallback;
}

function Wordmark({ light = false }: { light?: boolean }) {
  return <div className="wordmark-lockup" style={light ? { color: '#f7f6f0' } : undefined}>
    <div className="wordmark" style={light ? { color: '#f7f6f0' } : undefined}>Nexo <span>Growth</span></div>
    <span className="wordmark-subline">B2B DEAL ORIGINATION</span>
  </div>;
}

function Field({ label, name, required = true, type = 'text', placeholder, options, wide = false }: {
  label: string; name: string; required?: boolean; type?: string; placeholder?: string; options?: string[]; wide?: boolean;
}) {
  return <div className={wide ? 'form-span' : ''}>
    <label className="field-label" htmlFor={`field-${name}`}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    {options ? <select className="field" id={`field-${name}`} name={name} required={required} defaultValue="">
      <option value="" disabled>Seleccionar</option>{options.map(option => <option key={option} value={option}>{option}</option>)}
    </select> : <input className="field" id={`field-${name}`} name={name} type={type} placeholder={placeholder} required={required} />}
  </div>;
}

function TextAreaField({ label, name, placeholder, required = true }: { label: string; name: string; placeholder?: string; required?: boolean }) {
  return <div className="form-span">
    <label className="field-label" htmlFor={`field-${name}`}>{label}{required && <span aria-hidden="true"> *</span>}</label>
    <textarea className="field" id={`field-${name}`} name={name} placeholder={placeholder} required={required} minLength={10} />
  </div>;
}

function Consent({ kind }: { kind: 'buyer' | 'provider' }) {
  return <label className="form-span" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 11, lineHeight: 1.6, color: '#566a79' }}>
    <input aria-label="Consentimiento obligatorio" type="checkbox" name="consent" required style={{ marginTop: 3, accentColor: '#284b69' }} />
    <span>{kind === 'buyer'
      ? 'Autorizo a Nexo Growth a utilizar la información suministrada para analizar mi solicitud y contactarme.'
      : 'Autorizo a Nexo Growth a utilizar la información suministrada para evaluar oportunidades comerciales y contactarme.'}</span>
  </label>;
}

function getValues(form: HTMLFormElement) {
  return new FormData(form);
}
function value(data: FormData, key: string) { return String(data.get(key) ?? '').trim(); }
function optional(data: FormData, key: string) { const result = value(data, key); return result || undefined; }

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

function trackEvent(name: string, parameters?: Record<string, string>) {
  const analyticsWindow = window as AnalyticsWindow;
  analyticsWindow.gtag?.('event', name, parameters ?? {});
}

function IntakeDialog({ kind, onClose, contactEmail }: { kind: 'buyer' | 'provider'; onClose: () => void; contactEmail: string | null }) {
  const [serverError, setServerError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [feeInterest, setFeeInterest] = useState('');
  const buyerMutation = useSubmitBuyer({ request: { credentials: 'include' } });
  const providerMutation = useSubmitProvider({ request: { credentials: 'include' } });
  const isBuyer = kind === 'buyer';
  const pending = isBuyer ? buyerMutation.isPending : providerMutation.isPending;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError('');
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = getValues(form);
    const common = {
      name: value(data, 'name'), jobTitle: value(data, 'jobTitle'), company: value(data, 'company'),
      website: optional(data, 'website'), email: value(data, 'email'), phone: value(data, 'phone'),
      industry: value(data, 'industry'), country: value(data, 'country'), consent: true as const,
      honeypot: optional(data, 'honeypot'),
    };
    if (isBuyer) {
      buyerMutation.mutate({ data: {
        ...common, city: optional(data, 'city'), productService: value(data, 'productService'),
        description: value(data, 'description'), timeline: value(data, 'timeline') as 'Inmediatamente' | '1–3 meses' | '3–6 meses' | 'Más de 6 meses',
        budget: value(data, 'budget') as BuyerSubmissionInput['budget'], source: optional(data, 'source'),
      } }, {
        onSuccess: () => { trackEvent('buyer_form_submit'); setSubmitted(true); form.reset(); },
        onError: error => setServerError(errorMessage(error, 'No fue posible enviar tu solicitud. Inténtalo de nuevo.')),
      });
    } else {
      providerMutation.mutate({ data: {
        ...common, operatingRegions: value(data, 'operatingRegions'), productService: value(data, 'productService'),
        problemSolved: value(data, 'problemSolved'), targetIndustries: value(data, 'targetIndustries'),
        customerSize: value(data, 'customerSize'), averageTicket: value(data, 'averageTicket'),
        idealCustomer: value(data, 'idealCustomer'), successFeeInterest: value(data, 'successFeeInterest') as 'Sí' | 'Quiero conocer el modelo' | 'No',
      } }, {
        onSuccess: () => { trackEvent('provider_form_submit'); setSubmitted(true); form.reset(); },
        onError: error => setServerError(errorMessage(error, 'No fue posible enviar tu perfil. Inténtalo de nuevo.')),
      });
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal motion-in" role="dialog" aria-modal="true" aria-labelledby="intake-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start' }}>
        <div><div className="eyebrow">{isBuyer ? 'Para compradores' : 'Para proveedores'}</div>
           <h2 id="intake-title" className="serif" style={{ fontSize: 'clamp(30px,5vw,42px)', fontWeight: 400, margin: '10px 0 8px', lineHeight: 1 }}>{isBuyer ? 'Cuéntanos qué estás buscando' : 'Cuéntanos qué ofrece tu empresa'}</h2>
          <p style={{ margin: 0, color: '#667987', fontSize: 13, lineHeight: 1.7, maxWidth: 530 }}>{isBuyer ? 'Comparte el contexto de tu necesidad. Revisaremos la oportunidad antes de conectar contigo.' : 'Conoce oportunidades relevantes a partir de una necesidad real y validada.'}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar formulario" data-testid="button-close-intake" style={{ border: 0, background: 'transparent', color: '#42586b', padding: 3 }}><X size={20} /></button>
      </div>
      {submitted ? <div style={{ marginTop: 30, padding: 24, background: '#edf2ee', borderLeft: '3px solid #65806e' }} role="status" data-testid="status-submission-success">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><Check size={19} color="#577260" />
          <div><strong style={{ display: 'block', color: '#304d3b', fontSize: 15 }}>{isBuyer ? 'Solicitud recibida.' : 'Empresa registrada.'}</strong>
            <p style={{ margin: '7px 0 0', color: '#556b5b', lineHeight: 1.65, fontSize: 13 }}>{isBuyer ? 'Analizaremos la información y nos pondremos en contacto contigo si identificamos un posible encaje.' : 'Revisaremos la información y te contactaremos cuando identifiquemos una oportunidad con posible encaje.'}</p>
          </div>
        </div>
        <button className="btn btn-outline" type="button" onClick={onClose} style={{ marginTop: 18 }}>Cerrar</button>
      </div> : <form onSubmit={submit} noValidate style={{ marginTop: 28 }}>
        <div className="form-grid">
          <Field label="Nombre completo" name="name" placeholder="Nombre y apellido" />
          <Field label="Cargo" name="jobTitle" placeholder="Cargo actual" />
          <Field label="Empresa" name="company" placeholder="Nombre de la empresa" />
          <Field label="Sitio web" name="website" required={false} type="url" placeholder="https://" />
          <Field label="Correo corporativo" name="email" type="email" placeholder="nombre@empresa.com" />
          <Field label="Teléfono / WhatsApp" name="phone" type="tel" placeholder="+57" />
          <Field label="Industria" name="industry" placeholder="Industria" />
          <Field label="País" name="country" placeholder="País" />
          {isBuyer ? <>
            <Field label="Ciudad" name="city" required={false} placeholder="Ciudad" />
            <Field label="Producto o servicio que buscas" name="productService" placeholder="Producto o servicio" />
            <TextAreaField label="Describe tu necesidad" name="description" placeholder="Contexto, alcance y resultado esperado" />
            <Field label="¿Cuándo necesitas resolverlo?" name="timeline" options={timelineOptions} />
            <Field label="Presupuesto estimado del proyecto (COP)" name="budget" options={budgetOptions} />
            <Field label="¿Cómo nos conociste?" name="source" required={false} placeholder="Opcional" />
          </> : <>
            <Field label="Regiones donde operas" name="operatingRegions" placeholder="Países o regiones" />
            <Field label="Producto o servicio principal" name="productService" placeholder="Producto o servicio" />
            <TextAreaField label="¿Qué problema de negocio resuelves?" name="problemSolved" placeholder="Describe el problema y el resultado que ofreces" />
            <Field label="Industrias objetivo" name="targetIndustries" placeholder="Industrias" />
            <Field label="Tamaño de cliente" name="customerSize" placeholder="Por ejemplo, tamaño de empresa o facturación" />
            <Field label="Ticket promedio de transacción" name="averageTicket" placeholder="Valor y moneda" />
            <TextAreaField label="Empresas que serían clientes ideales" name="idealCustomer" placeholder="Describe el tipo de empresa ideal" />
            <div>
              <label className="field-label" htmlFor="field-successFeeInterest">¿Aceptaría trabajar bajo un modelo success-fee? <span aria-hidden="true">*</span></label>
              <select className="field" id="field-successFeeInterest" name="successFeeInterest" required value={feeInterest} onChange={event => setFeeInterest(event.target.value)}>
                <option value="" disabled>Seleccionar</option><option>Sí</option><option>Quiero conocer el modelo</option><option>No</option>
              </select>
            </div>
            {(feeInterest === 'Sí' || feeInterest === 'Quiero conocer el modelo') && <aside className="form-span" style={{ padding: 15, background: '#edf1f1', color: '#435d70', fontSize: 12, lineHeight: 1.7 }} data-testid="text-success-fee-model">
              El modelo inicial de Nexo Growth contempla una comisión del 5% sobre el revenue efectivamente generado por oportunidades atribuidas a Nexo Growth, con una ventana de atribución de 6 meses.
            </aside>}
          </>}
          <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }} aria-hidden="true">
            <label htmlFor="honeypot">Website URL</label><input id="honeypot" name="honeypot" type="text" tabIndex={-1} autoComplete="off" />
          </div>
          <Consent kind={kind} />
        </div>
        {serverError && <p role="alert" className="form-error" data-testid="status-submit-error" style={{ marginTop: 14 }}>{serverError}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, marginTop: 22, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: '#748490' }}>Los campos marcados con * son obligatorios.</span>
          <button className="btn" type="submit" disabled={pending} data-testid={`button-submit-${kind}`}>{pending ? 'Enviando…' : isBuyer ? 'ENVIAR SOLICITUD' : 'REGISTRAR MI EMPRESA'}<ArrowRight size={15} /></button>
        </div>
        {contactEmail && <div style={{ marginTop: 18, fontSize: 11, color: '#778792' }}>Contacto: <a href={`mailto:${contactEmail}`} style={{ color: '#355671' }}>{contactEmail}</a></div>}
      </form>}
    </section>
  </div>;
}

function Home() {
  const [dialog, setDialog] = useState<'buyer' | 'provider' | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const config = useGetPublicConfig({ request: { credentials: 'include' } });
  const contactEmail = config.data?.contactEmail ?? null;
  const gaMeasurementId = config.data?.gaMeasurementId ?? null;

  useEffect(() => {
    if (!gaMeasurementId) return;
    const analyticsWindow = window as AnalyticsWindow;
    analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
    analyticsWindow.gtag = (...args: unknown[]) => analyticsWindow.dataLayer?.push(args);
    analyticsWindow.gtag('js', new Date());
    analyticsWindow.gtag('config', gaMeasurementId);
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`;
    document.head.appendChild(script);
    return () => {
      script.remove();
      delete analyticsWindow.gtag;
    };
  }, [gaMeasurementId]);

  function openDialog(kind: 'buyer' | 'provider', label: string) {
    trackEvent('cta_click', { cta_label: label });
    trackEvent(kind === 'buyer' ? 'buyer_form_open' : 'provider_form_open');
    setDialog(kind);
  }

  return <main>
    <header style={{ borderBottom: '1px solid #dce2e1', background: 'rgba(250,249,245,.94)' }}>
      <div className="shell" style={{ minHeight: 76, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" aria-label="Nexo Growth inicio" style={{ textDecoration: 'none' }}><Wordmark /></a>
        <nav aria-label="Navegación principal" style={{ display: 'flex', gap: 34, alignItems: 'center' }} className={mobileNav ? 'mobile-menu-open' : 'desktop-nav'}>
          <a className="nav-link" href="#method">Cómo trabajamos</a><a className="nav-link" href="#approach">Nuestro enfoque</a>
          <button className="btn" onClick={() => openDialog('buyer', 'nav_buyer')} data-testid="button-nav-buyer">Tengo una necesidad<ArrowRight size={14} /></button>
        </nav>
        <button className="mobile-toggle" type="button" onClick={() => setMobileNav(v => !v)} aria-label="Abrir menú"><Menu size={20} /></button>
      </div>
    </header>
    <section style={{ overflow: 'hidden', position: 'relative', borderBottom: '1px solid #dde2e0' }}>
      <div className="shell hero-grid" style={{ minHeight: 610, display: 'grid', gridTemplateColumns: '1.06fr .94fr', alignItems: 'center', gap: 55, paddingTop: 54, paddingBottom: 62 }}>
        <div className="motion-in">
          <div className="eyebrow" style={{ marginBottom: 23 }}>NEXO GROWTH</div>
          <h1 className="serif" style={{ fontSize: 'clamp(48px,6.7vw,82px)', fontWeight: 400, letterSpacing: '-.045em', lineHeight: .99, margin: '0 0 23px', color: '#203956' }}>B2B opportunities.<br /><em style={{ color: '#718796' }}>Real connections.</em></h1>
          <p style={{ maxWidth: 490, fontSize: 16, lineHeight: 1.8, color: '#5b6d7b', margin: '0 0 29px' }}>Identificamos oportunidades comerciales dentro de empresas y las conectamos con proveedores capaces de convertirlas en negocio.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => openDialog('buyer', 'hero_buyer')} data-testid="button-buyer-intake">TENGO UNA NECESIDAD<ArrowRight size={15} /></button>
            <button className="btn btn-outline" onClick={() => openDialog('provider', 'hero_provider')} data-testid="button-provider-intake">OFREZCO UNA SOLUCIÓN<ArrowUpRight size={14} /></button>
          </div>
          <div style={{ marginTop: 34, color: '#6d7d87', fontSize: 11, letterSpacing: '.04em' }}>Success-based B2B deal origination.</div>
        </div>
        <div className="hero-visual motion-in motion-delay" aria-label="Diagrama de conexión entre necesidad y solución" style={{ position: 'relative', minHeight: 422, display: 'grid', placeItems: 'center' }}>
          <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" />
          <div className="signal signal-a"><span>01</span><div><b>Señal</b><small>Necesidad activa</small></div></div>
          <div className="signal signal-b"><span>02</span><div><b>Validación</b><small>Encaje y contexto</small></div></div>
          <div className="signal signal-c"><span>03</span><div><b>Conexión</b><small>Proveedor relevante</small></div></div>
          <div className="orbit-core"><span className="core-mark">N</span><div>NEXO<br /><small>GROWTH</small></div></div>
          <div className="hero-coordinate">4° 42' N&nbsp; / &nbsp;74° 04' W</div>
        </div>
      </div>
      <div style={{ position: 'absolute', right: '3.5%', top: 35, writingMode: 'vertical-rl', fontSize: 9, letterSpacing: '.2em', color: '#90a0aa' }}>OPPORTUNITY, WITH CONTEXT</div>
    </section>
      <section id="method" className="shell" style={{ paddingTop: 112, paddingBottom: 120 }}>
      <div className="method-heading">
        <div><div className="eyebrow">Cómo funciona</div><h2 className="serif" style={{ fontSize: 'clamp(36px,4.5vw,56px)', lineHeight: 1.08, fontWeight: 400, letterSpacing: '-.03em', margin: '16px 0 0', maxWidth: 580 }}>From signal to opportunity.</h2></div>
        <p style={{ maxWidth: 310, color: '#667987', fontSize: 13, lineHeight: 1.8, margin: '18px 0 0' }}>Señales empresariales, oportunidades validadas y conexiones relevantes.</p>
      </div>
      <div className="process-list">
        {[['01','Identificamos','Analizamos señales empresariales que pueden indicar una necesidad comercial real.'],['02','Validamos','Investigamos la empresa, el proyecto, la necesidad y el posible encaje comercial.'],['03','Conectamos','Facilitamos la conexión entre la empresa compradora y el proveedor adecuado.']].map(([n,title,copy]) =>
          <article key={n} className="process-item"><span className="process-number">{n}</span><div><h3 className="serif">{title}</h3><p>{copy}</p></div><ArrowDown size={16} strokeWidth={1.4} className="process-arrow" /></article>)}
      </div>
    </section>
    <section id="approach" style={{ background: '#e9eeed', borderTop: '1px solid #d8e0e0', borderBottom: '1px solid #d8e0e0' }}>
      <div className="shell approach-grid" style={{ paddingTop: 104, paddingBottom: 108, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 90, alignItems: 'center' }}>
        <div className="approach-figure">
          <div className="figure-top"><span>RELACIÓN / CONTEXTO</span><span>NG—01</span></div>
          <div className="figure-lines"><div /><div /><div /><div /></div>
          <div className="figure-caption"><span>El momento adecuado</span><span>La contraparte adecuada</span></div>
          <div className="figure-dot dot-one" /><div className="figure-dot dot-two" /><div className="figure-dot dot-three" />
        </div>
        <div><div className="eyebrow">Nuestro enfoque</div><h2 className="serif" style={{ fontSize: 'clamp(39px,5vw,61px)', lineHeight: 1.04, fontWeight: 400, letterSpacing: '-.035em', margin: '17px 0 21px' }}>We don't sell leads.<br /><span style={{ color: '#637f8e' }}>We identify opportunities.</span></h2>
          <p style={{ fontSize: 14, color: '#5d707d', lineHeight: 1.9, maxWidth: 460 }}>Nexo Growth no trabaja con bases de datos genéricas ni contactos masivos. Nuestro objetivo es identificar señales empresariales concretas, validar su relevancia y encontrar el proveedor adecuado para cada oportunidad.</p>
          <a className="text-link" href="#participate" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 13 }}>Conoce las vías de colaboración<ArrowRight size={13} /></a></div>
      </div>
    </section>
    <section id="buyers" className="shell" style={{ paddingTop: 78, paddingBottom: 62 }}>
      <div className="pathways">
        <article className="pathway">
          <span className="eyebrow">COMPRADORES</span>
          <h2 className="serif">¿Tu empresa está buscando una solución?</h2>
          <p>Encuentra proveedores para necesidades concretas.</p>
          <button className="text-link" onClick={() => openDialog('buyer', 'buyer_section')}>SOY COMPRADOR<ArrowRight size={13} /></button>
        </article>
      </div>
    </section>
    <section id="providers" style={{ background: '#e9eeed', borderTop: '1px solid #d8e0e0', borderBottom: '1px solid #d8e0e0' }}>
      <div className="shell" style={{ paddingTop: 68, paddingBottom: 68 }}>
        <div className="pathways">
          <article className="pathway">
            <span className="eyebrow">PROVEEDORES</span>
            <h2 className="serif">¿Tu empresa vende a otras empresas?</h2>
            <p>Accede a oportunidades comerciales relevantes para tu empresa.</p>
            <button className="text-link" onClick={() => openDialog('provider', 'provider_section')}>SOY PROVEEDOR<ArrowRight size={13} /></button>
          </article>
        </div>
      </div>
    </section>
    <section id="participate" className="shell" style={{ paddingTop: 88, paddingBottom: 95 }}>
      <div style={{ textAlign: 'center', maxWidth: 630, margin: '0 auto 38px' }}><div className="eyebrow">Para compradores y proveedores</div><h2 className="serif" style={{ fontSize: 'clamp(38px,5vw,58px)', fontWeight: 400, letterSpacing: '-.04em', margin: '15px 0 13px' }}>Para empresas.</h2></div>
      <div className="pathways">
        <article className="pathway"><span className="eyebrow">COMPRADORES</span><h3 className="serif">Encuentra proveedores para necesidades concretas.</h3><p>Cuéntanos qué necesitas. Analizaremos tu requerimiento y buscaremos proveedores que puedan atenderlo.</p><button className="text-link" onClick={() => openDialog('buyer', 'buyers_section')} data-testid="button-open-buyer">PLANTEAR UNA NECESIDAD<ArrowRight size={13} /></button></article>
        <article className="pathway"><span className="eyebrow">PROVEEDORES</span><h3 className="serif">Accede a oportunidades comerciales relevantes para tu empresa.</h3><p>Nexo Growth identifica oportunidades B2B que pueden tener encaje con las soluciones que ofrece tu empresa.</p><button className="text-link" onClick={() => openDialog('provider', 'providers_section')} data-testid="button-open-provider">REGISTRAR MI EMPRESA<ArrowRight size={13} /></button></article>
      </div>
    </section>
    <section id="contact" style={{ background: '#203956', color: '#f7f6f0' }}>
      <div className="shell closing" style={{ minHeight: 268, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 30, paddingTop: 55, paddingBottom: 55 }}>
        <div><div className="eyebrow" style={{ color: '#a6bbc4' }}>Nexo Growth</div><h2 className="serif" style={{ fontWeight: 400, fontSize: 'clamp(32px,4vw,49px)', margin: '13px 0 0', letterSpacing: '-.025em' }}>Your next opportunity may already be taking shape.</h2><p style={{ color: '#c6d1d2', maxWidth: 470, lineHeight: 1.7 }}>Cuéntanos qué estás buscando o qué solución ofrece tu empresa.</p></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-light" onClick={() => openDialog('buyer', 'closing_buyer')} data-testid="button-closing-buyer">TENGO UNA NECESIDAD<ArrowRight size={15} /></button>
          <button className="btn btn-outline" onClick={() => openDialog('provider', 'closing_provider')} data-testid="button-closing-provider" style={{ color: '#f7f6f0', borderColor: 'rgba(247,246,240,.45)' }}>OFREZCO UNA SOLUCIÓN<ArrowUpRight size={14} /></button>
        </div>
      </div>
    </section>
    <footer style={{ background: '#f1f1eb', borderTop: '1px solid #d9dfdc' }}>
      <div className="shell footer-content" style={{ minHeight: 102, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', paddingTop: 24, paddingBottom: 24 }}>
        <Wordmark />
        <nav aria-label="Navegación del pie de página" className="footer-links">
          <a href="/">Inicio</a><a href="/#method">Cómo funciona</a><a href="/#buyers">Compradores</a><a href="/#providers">Proveedores</a>
          <a href={contactEmail ? `mailto:${contactEmail}` : '#contact'}>Contacto</a><a href="/privacy">Privacy Policy</a>
        </nav>
        {contactEmail && <a href={`mailto:${contactEmail}`} className="text-link">{contactEmail}</a>}
      </div>
      {config.isError && <div className="shell" role="status" style={{ paddingBottom: 12, color: '#829098', fontSize: 10 }}>La configuración de contacto no está disponible temporalmente.</div>}
    </footer>
    {dialog && <IntakeDialog kind={dialog} onClose={() => setDialog(null)} contactEmail={contactEmail} />}
  </main>;
}

function PrivacyPolicy() {
  const config = useGetPublicConfig({ request: { credentials: 'include' } });
  const contactEmail = config.data?.contactEmail ?? null;

  return <main style={{ minHeight: '100vh', background: '#faf9f4' }}>
    <header style={{ borderBottom: '1px solid #dce2e1' }}>
      <div className="shell" style={{ minHeight: 76, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" aria-label="Nexo Growth inicio" style={{ textDecoration: 'none' }}><Wordmark /></a>
        <a className="text-link" href="/">Volver al inicio<ArrowRight size={13} /></a>
      </div>
    </header>
    <article className="shell" style={{ maxWidth: 820, paddingTop: 76, paddingBottom: 100 }}>
      <div className="eyebrow">NEXO GROWTH · PRIVACIDAD</div>
      <h1 className="serif" style={{ fontSize: 'clamp(42px,6vw,64px)', fontWeight: 400, letterSpacing: '-.04em', color: '#203956', margin: '17px 0 12px' }}>Privacy Policy</h1>
      <p style={{ color: '#6b7c87', fontSize: 12 }}>Última actualización: octubre de 2026</p>
      <p style={{ color: '#526878', lineHeight: 1.85 }}>Este aviso explica cómo Nexo Growth utiliza los datos que las empresas y sus representantes envían mediante los formularios de compradores y proveedores.</p>
      <h2 className="serif" style={{ fontSize: 27, fontWeight: 400, marginTop: 38 }}>Información recopilada</h2>
      <p style={{ color: '#526878', lineHeight: 1.85 }}>Los formularios pueden recopilar nombre, cargo, empresa, sitio web, correo electrónico, teléfono, industria, país, ciudad o regiones de operación y la información comercial que envíes sobre una necesidad, productos o servicios, clientes y oportunidades.</p>
      <h2 className="serif" style={{ fontSize: 27, fontWeight: 400, marginTop: 38 }}>Uso y acceso</h2>
      <p style={{ color: '#526878', lineHeight: 1.85 }}>La información se utiliza para analizar solicitudes de compradores, evaluar perfiles de proveedores, identificar un posible encaje comercial y contactar a la persona que envió el formulario. Las solicitudes se guardan en la base de datos de la aplicación; cuando el correo transaccional está configurado, se envía una notificación operativa al equipo de Nexo Growth y una confirmación al remitente. El panel interno requiere autenticación.</p>
      <h2 className="serif" style={{ fontSize: 27, fontWeight: 400, marginTop: 38 }}>Consultas sobre tus datos</h2>
      <p style={{ color: '#526878', lineHeight: 1.85 }}>{contactEmail
        ? <>Para consultas sobre la información enviada, escribe a <a href={`mailto:${contactEmail}`} style={{ color: '#355671' }}>{contactEmail}</a>.</>
        : 'El canal de contacto para consultas de privacidad aún no está configurado.'}</p>
      <p style={{ color: '#6b7c87', fontSize: 12, lineHeight: 1.75, marginTop: 42, borderTop: '1px solid #dce2e1', paddingTop: 18 }}>Antes de publicar, Nexo Growth debe completar la identidad legal del responsable del tratamiento, los datos de contacto oficiales, los plazos de conservación y el procedimiento para solicitudes de titulares.</p>
    </article>
  </main>;
}

function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const login = useAdminLogin({ request: { credentials: 'include' } });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    login.mutate({ data: { password } }, {
      onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() }); },
      onError: e => setError(errorMessage(e, 'No se pudo validar el acceso. Inténtalo de nuevo.')),
    });
  }
  return <div className="admin-auth">
    <a href="/" style={{ textDecoration: 'none' }}><Wordmark /></a>
    <section className="auth-card">
      <div className="auth-lock"><LockKeyhole size={19} /></div>
      <div className="eyebrow">Espacio de administración</div>
      <h1 className="serif">Acceso interno</h1>
      <p>Ingresa tu contraseña para revisar las solicitudes recibidas.</p>
      <form onSubmit={submit}>
        <label className="field-label" htmlFor="admin-password">Contraseña</label>
        <input className="field" id="admin-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required data-testid="input-admin-password" />
        {error && <div role="alert" className="form-error" data-testid="status-admin-login-error">{error}</div>}
        <button className="btn" type="submit" disabled={login.isPending} data-testid="button-admin-login" style={{ width: '100%', marginTop: 18 }}>{login.isPending ? 'Validando…' : 'Entrar'}<ArrowRight size={14} /></button>
      </form>
    </section>
    <a href="/" className="auth-back">Volver a Nexo Growth</a>
  </div>;
}

function DataStat({ label, value, detail }: { label: string; value: number | undefined; detail: string }) {
  return <div className="stat-card"><span>{label}</span><strong>{value === undefined ? <i className="skeleton-bar" /> : value}</strong><small>{detail}</small></div>;
}

function SubmissionRow({ item, onStatus }: { item: AdminSubmission; onStatus: (id: number, status: SubmissionStatus) => void }) {
  const [expanded, setExpanded] = useState(false);
  return <>
    <tr data-testid={`row-submission-${item.id}`}>
      <td><div className="table-name">{item.name}</div><div className="table-sub">{item.jobTitle}</div></td>
      <td><div className="table-name">{item.company}</div><div className="table-sub">{item.industry} · {item.country}</div></td>
      <td><span className={`type-tag type-${item.type}`}>{item.type === 'BUYER' ? 'Comprador' : 'Proveedor'}</span></td>
      <td><span className={`status-pill status-${item.status}`}>{item.status}</span></td>
      <td className="date-cell">{new Date(item.createdAt).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
      <td><div className="row-actions"><select aria-label={`Estado de ${item.company}`} className="status-select" value={item.status} onChange={e => onStatus(item.id, e.target.value as SubmissionStatus)} data-testid={`select-status-${item.id}`}>{statuses.map(status => <option key={status} value={status}>{status}</option>)}</select><button type="button" className="detail-button" onClick={() => setExpanded(v => !v)} aria-label="Ver detalles" data-testid={`button-details-${item.id}`}>{expanded ? <X size={15} /> : <ArrowUpRight size={15} />}</button></div></td>
    </tr>
    {expanded && <tr className="detail-row"><td colSpan={6}><div className="details-grid">
      <div><b>Correo</b><a href={`mailto:${item.email}`}>{item.email}</a></div><div><b>Teléfono / WhatsApp</b><a href={`tel:${item.phone}`}>{item.phone}</a></div>
      {item.website && <div><b>Sitio web</b><a href={item.website.startsWith('http') ? item.website : `https://${item.website}`} target="_blank" rel="noreferrer">{item.website}</a></div>}
      <div><b>Producto / servicio</b><span>{item.productService || '—'}</span></div>
      {item.type === 'BUYER' ? <><div><b>Plazo</b><span>{item.timeline || '—'}</span></div><div><b>Presupuesto (COP)</b><span>{item.budget || '—'}</span></div><div className="detail-wide"><b>Necesidad</b><span>{item.description || '—'}</span></div></> : <><div><b>Regiones</b><span>{item.operatingRegions || '—'}</span></div><div><b>Industrias objetivo</b><span>{item.targetIndustries || '—'}</span></div><div><b>Modelo de success fee</b><span>{item.successFeeInterest || '—'}</span></div><div className="detail-wide"><b>Problema que resuelve</b><span>{item.problemSolved || '—'}</span></div><div className="detail-wide"><b>Cliente ideal</b><span>{item.idealCustomer || '—'}</span></div></>}
    </div></td></tr>}
  </>;
}

function AdminDashboard() {
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState<SubmissionType | ''>('');
  const [filterStatus, setFilterStatus] = useState<SubmissionStatus | ''>('');
  const params = { ...(filterType ? { type: filterType } : {}), ...(filterStatus ? { status: filterStatus } : {}) };
  const summary = useGetAdminSummary({ request: { credentials: 'include' } });
  const list = useListAdminSubmissions(params, { request: { credentials: 'include' } });
  const logout = useAdminLogout({ request: { credentials: 'include' } });
  const update = useUpdateAdminSubmission({ request: { credentials: 'include' } });
  const [mutationError, setMutationError] = useState('');
  function updateStatus(id: number, status: SubmissionStatus) {
    setMutationError('');
    update.mutate({ id, data: { status } }, {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListAdminSubmissionsQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
      },
      onError: e => setMutationError(errorMessage(e, 'No se pudo actualizar el estado. Inténtalo de nuevo.')),
    });
  }
  function signOut() {
    logout.mutate(undefined, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() }); } });
  }
  const items = list.data ?? [];
  return <div className="admin-page">
    <aside className="admin-sidebar"><a href="/" className="admin-brand"><Wordmark light /></a><div className="sidebar-rule" /><div className="side-label">GESTIÓN</div><div className="side-active"><span className="side-indicator" />Solicitudes</div><div className="sidebar-bottom"><span>DEAL ORIGINATION</span><span>COLOMBIA · LATAM</span></div></aside>
    <main className="admin-main">
      <header className="admin-top"><div className="admin-breadcrumb">Nexo Growth <span>/</span> Solicitudes</div><button type="button" onClick={signOut} disabled={logout.isPending} className="logout-button" data-testid="button-admin-logout">{logout.isPending ? 'Saliendo…' : 'Cerrar sesión'}<ArrowUpRight size={13} /></button></header>
      <div className="admin-content">
        <div className="admin-heading"><div><div className="eyebrow">OPERACIONES / PIPELINE</div><h1 className="serif">Solicitudes</h1><p>Revisa y gestiona las oportunidades recibidas.</p></div><div className="data-refresh"><span className="refresh-dot" />Datos en tiempo real</div></div>
        {(summary.isError || list.isError) && <div className="admin-error" role="alert" data-testid="status-admin-load-error"><CircleAlert size={17} /><span>No se pudieron cargar las solicitudes. Comprueba tu sesión e inténtalo de nuevo.</span><button onClick={() => { void summary.refetch(); void list.refetch(); }}>Reintentar</button></div>}
        {mutationError && <div className="admin-error" role="alert" data-testid="status-admin-update-error"><CircleAlert size={17} /><span>{mutationError}</span><button onClick={() => setMutationError('')}>Cerrar</button></div>}
        <section className="stats-grid" aria-label="Resumen de solicitudes">
          <DataStat label="Total de solicitudes" value={summary.data?.total} detail="En todos los estados" />
          <DataStat label="Compradores" value={summary.data?.buyers} detail="Necesidades empresariales" />
          <DataStat label="Proveedores" value={summary.data?.providers} detail="Compañías registradas" />
          <div className="latest-card"><span>ÚLTIMA ACTIVIDAD</span>{summary.isLoading ? <i className="skeleton-bar" /> : summary.data?.latest?.[0] ? <><b>{summary.data.latest[0].company}</b><small>{new Date(summary.data.latest[0].createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}</small></> : <small>Sin actividad reciente</small>}</div>
        </section>
        <section className="table-panel">
          <div className="table-toolbar"><div><h2>Pipeline</h2><span>{list.isLoading ? 'Cargando solicitudes…' : `${items.length} ${items.length === 1 ? 'solicitud' : 'solicitudes'}`}</span></div>
            <div className="filter-controls"><label><span className="sr-only">Filtrar por tipo</span><select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value as SubmissionType | '')} data-testid="select-filter-type"><option value="">Todos los tipos</option><option value="BUYER">Compradores</option><option value="PROVIDER">Proveedores</option></select><ChevronDown size={12} /></label>
              <label><span className="sr-only">Filtrar por estado</span><select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value as SubmissionStatus | '')} data-testid="select-filter-status"><option value="">Todos los estados</option>{statuses.map(s => <option key={s}>{s}</option>)}</select><ChevronDown size={12} /></label></div>
          </div>
          <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>CONTACTO</th><th>EMPRESA</th><th>TIPO</th><th>ESTADO</th><th>RECIBIDO</th><th>GESTIÓN</th></tr></thead>
            <tbody>{list.isLoading ? [1,2,3].map(n => <tr key={n} className="skeleton-row"><td colSpan={6}><i className="skeleton-bar" /></td></tr>) : items.map(item => <SubmissionRow key={item.id} item={item} onStatus={updateStatus} />)}</tbody>
          </table>
          {!list.isLoading && !list.isError && items.length === 0 && <div className="empty-state" data-testid="status-submissions-empty"><div className="empty-mark">N</div><h3 className="serif">Todavía no hay solicitudes.</h3><p>Las nuevas oportunidades aparecerán aquí cuando sean recibidas.</p></div>}
        </div>
      </section>
      </div>
    </main>
  </div>;
}

function Admin() {
  const session = useGetAdminSession({ request: { credentials: 'include' } });
  if (session.isLoading) return <div className="admin-loading"><div className="loading-mark">N</div><span>Comprobando acceso</span></div>;
  if (session.isError) return <div className="admin-loading"><CircleAlert size={21} /><span>No se pudo comprobar el acceso.</span><button className="btn btn-outline" onClick={() => void session.refetch()}>Reintentar</button></div>;
  return session.data?.authenticated ? <AdminDashboard /> : <AdminLogin />;
}

function AppRouter() {
  const [location] = useLocation();
  return <div key={location}><Switch><Route path="/" component={Home} /><Route path="/privacy" component={PrivacyPolicy} /><Route path="/admin" component={Admin} /><Route component={NotFound} /></Switch></div>;
}

function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AppRouter /></WouterRouter></QueryClientProvider>;
}

export default App;