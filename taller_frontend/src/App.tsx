import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  apiRequest,
  type LoginResponse,
  type Order,
  type Product,
  type User,
} from "./api";
import "./App.css";

type AuthSession = {
  accessToken: string;
  user: User;
};

type CartItem = {
  product: Product;
  quantity: number;
};

type CatalogFilter = "all" | "available" | "lowPrice";

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
});

function productEmoji(name: string): string {
  const value = name.toLowerCase();
  if (value.includes("crocs") || value.includes("zapato") || value.includes("tenis")) {
    return "👟";
  }
  if (value.includes("ropa") || value.includes("playera") || value.includes("sudadera")) {
    return "👕";
  }
  if (value.includes("libro")) {
    return "📚";
  }
  if (value.includes("audífono") || value.includes("audifono") || value.includes("audio")) {
    return "🎧";
  }
  if (value.includes("café") || value.includes("cafe") || value.includes("taza")) {
    return "☕";
  }
  return "📦";
}

function readError(error: unknown): string {
  return error instanceof Error ? error.message : "Ocurrió un error inesperado.";
}

function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CatalogFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [panel, setPanel] = useState<"cart" | "auth" | "orders" | "seller" | null>(
    null,
  );
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [pendingCheckout, setPendingCheckout] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadProducts = useCallback(async () => {
    try {
      const result = await apiRequest<{ products: Product[] }>("/products");
      setProducts(result.products);
      setError("");
    } catch (loadError) {
      setError(readError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<{ products: Product[] }>("/products")
      .then((result) => {
        if (active) {
          setProducts(result.products);
          setError("");
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(readError(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es-MX");
    const matches = products.filter((product) => {
      const matchesSearch =
        query.length === 0 ||
        `${product.name} ${product.description}`
          .toLocaleLowerCase("es-MX")
          .includes(query);
      const matchesFilter =
        filter === "all" ||
        (filter === "available" && product.stock > 0) ||
        (filter === "lowPrice" && product.price < 1000);
      return matchesSearch && matchesFilter;
    });

    return filter === "lowPrice"
      ? matches.sort((first, second) => first.price - second.price)
      : matches;
  }, [filter, products, search]);

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cart.reduce(
    (total, item) => total + item.product.price * item.quantity,
    0,
  );

  function addToCart(product: Product) {
    if (product.stock < 1) {
      setNotice("Este producto no tiene existencias por ahora.");
      return;
    }

    const existing = cart.find((item) => item.product.productId === product.productId);
    if (existing && existing.quantity >= product.stock) {
      setNotice(`Solo hay ${product.stock} unidades disponibles de ${product.name}.`);
      return;
    }

    setCart((current) => {
      const item = current.find(
        (entry) => entry.product.productId === product.productId,
      );
      if (item) {
        return current.map((entry) =>
          entry.product.productId === product.productId
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
    setNotice(`${product.name} se agregó a tu carrito.`);
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((current) =>
      current
        .map((item) =>
          item.product.productId === productId
            ? { ...item, quantity: Math.min(quantity, item.product.stock) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  async function placeOrder(accessToken: string) {
    if (cart.length === 0) {
      setNotice("Agrega al menos un producto antes de continuar.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const result = await apiRequest<{ order: Order }>("/orders/create", {
        method: "POST",
        token: accessToken,
        body: {
          items: cart.map(({ product, quantity }) => ({
            productId: product.productId,
            quantity,
          })),
        },
      });
      setCart([]);
      setPendingCheckout(false);
      setPanel(null);
      setNotice(`¡Listo! Tu pedido ${result.order.orderId.slice(0, 8)} fue creado.`);
    } catch (orderError) {
      setError(readError(orderError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCheckout() {
    if (cart.length === 0) {
      setNotice("Agrega al menos un producto antes de continuar.");
      return;
    }
    if (!auth) {
      setPendingCheckout(true);
      setAuthMode("login");
      setPanel("auth");
      return;
    }
    await placeOrder(auth.accessToken);
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      if (authMode === "register") {
        await apiRequest("/users/register", {
          method: "POST",
          body: { name, email, password },
        });
      }

      const result = await apiRequest<LoginResponse>("/users/login", {
        method: "POST",
        body: { email, password },
      });
      const session = {
        accessToken: result.accessToken,
        user: result.user,
      };
      setAuth(session);
      setPassword("");
      setPanel(null);
      setNotice(`¡Hola, ${result.user.name}! Ya iniciaste sesión.`);

      if (pendingCheckout) {
        await placeOrder(result.accessToken);
      }
    } catch (authError) {
      setError(readError(authError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function openOrders() {
    if (!auth) {
      setAuthMode("login");
      setPanel("auth");
      setNotice("Inicia sesión para consultar tus pedidos.");
      return;
    }

    setPanel("orders");
    setError("");
    setIsSubmitting(true);
    try {
      const result = await apiRequest<{ orders: Order[] }>(
        `/orders/list/users/${encodeURIComponent(auth.user.userId)}?limit=50`,
        { token: auth.accessToken },
      );
      setOrders(result.orders);
    } catch (ordersError) {
      setError(readError(ordersError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setIsSubmitting(true);
    setError("");
    try {
      await apiRequest("/products/create", {
        method: "POST",
        token: auth.accessToken,
        body: {
          name: formData.get("productName"),
          description: formData.get("description"),
          price: Number(formData.get("price")),
          stock: Number(formData.get("stock")),
        },
      });
      form.reset();
      setNotice("Tu producto ya está publicado.");
      setPanel(null);
      setIsLoading(true);
      await loadProducts();
    } catch (createError) {
      setError(readError(createError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function dismissPanel() {
    setPanel(null);
    setPendingCheckout(false);
    setError("");
  }

  return (
    <div className="store">
      <div className="announcement">
        <span className="announcement-spark">✦</span>
        Tu mercado local, abierto todos los días
        <span className="announcement-spark">✦</span>
      </div>

      <header className="site-header">
        <a
          className="brand"
          href="#inicio"
          aria-label="Amazon Lite, ir al inicio"
          onClick={() => {
            setPanel(null);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <span className="brand-mark">a<span>.</span></span>
          <span className="brand-name">amazon<span>lite</span></span>
        </a>

        <label className="search-box">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            aria-label="Buscar productos"
            placeholder="¿Qué estás buscando?"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <kbd>⌘ K</kbd>
        </label>

        <nav className="header-actions" aria-label="Navegación principal">
          {auth ? (
            <>
              {auth.user.role === "seller" && (
                <button
                  className="text-button seller-link"
                  type="button"
                  onClick={() => setPanel("seller")}
                >
                  Vender
                </button>
              )}
              <button className="account-button" type="button" onClick={() => void openOrders()}>
                <span className="account-icon">↗</span>
                <span className="account-label">
                  <small>Hola,</small>
                  {auth.user.name.split(" ")[0]}
                </span>
              </button>
              <button
                className="text-button logout-link"
                type="button"
                onClick={() => {
                  setAuth(null);
                  setOrders([]);
                  setNotice("Cerraste sesión.");
                }}
              >
                Salir
              </button>
            </>
          ) : (
            <button
              className="account-button"
              type="button"
              onClick={() => {
                setAuthMode("login");
                setPanel("auth");
              }}
            >
              <span className="account-icon">↗</span>
              <span className="account-label">
                <small>Hola, bienvenido</small>
                Inicia sesión
              </span>
            </button>
          )}
          <button
            className="cart-button"
            type="button"
            aria-label={`Abrir carrito, ${cartCount} productos`}
            onClick={() => setPanel("cart")}
          >
            <span className="cart-icon">♧</span>
            <span>Carrito</span>
            <b className="cart-count">{cartCount}</b>
          </button>
        </nav>
      </header>

      <main id="inicio">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> TU TIENDA, TU LUGAR</div>
            <h1>Encuentra eso<br />que te hace <em>feliz.</em></h1>
            <p>Descubre productos increíbles de vendedores locales.</p>
            <a className="hero-cta" href="#catalogo">
              Explorar productos <span aria-hidden="true">↘</span>
            </a>
            <div className="hero-proof">
              <span className="proof-avatars" aria-hidden="true">
                <i>☺</i><i>✿</i><i>✦</i>
              </span>
              <span>Hecho para comprar<br /><strong>con confianza</strong></span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-orbit orbit-one" />
            <div className="hero-orbit orbit-two" />
            <div className="hero-sun" />
            <div className="hero-product hero-product-back">👜</div>
            <div className="hero-product hero-product-front">👟</div>
            <div className="hero-sticker sticker-top">COSAS<br />BUENAS <span>✦</span></div>
            <div className="hero-sticker sticker-bottom"><span>✳</span> Compra local,<br />compra feliz</div>
          </div>
          <div className="hero-index"><span>01</span> / 03</div>
        </section>

        <section className="benefits" aria-label="Beneficios">
          <div className="benefit">
            <span className="benefit-icon">✳</span>
            <div><strong>Productos únicos</strong><small>Encuentra algo especial</small></div>
          </div>
          <div className="benefit">
            <span className="benefit-icon">↗</span>
            <div><strong>Compra segura</strong><small>Tu pedido, bajo control</small></div>
          </div>
          <div className="benefit">
            <span className="benefit-icon">♡</span>
            <div><strong>Apoya lo local</strong><small>Compra a vendedores reales</small></div>
          </div>
        </section>

        <section className="catalog-section" id="catalogo">
          <div className="section-heading">
            <div>
              <div className="eyebrow"><span /> UNA SELECCIÓN PARA TI</div>
              <h2>Descubre tus <em>favoritos</em></h2>
            </div>
            <span className="product-count">
              {products.length} {products.length === 1 ? "producto" : "productos"}
            </span>
          </div>

          <div className="catalog-toolbar">
            <div className="filter-tabs" role="group" aria-label="Filtrar productos">
              <button
                className={filter === "all" ? "filter-tab active" : "filter-tab"}
                type="button"
                onClick={() => setFilter("all")}
              >
                Todo
              </button>
              <button
                className={filter === "available" ? "filter-tab active" : "filter-tab"}
                type="button"
                onClick={() => setFilter("available")}
              >
                En existencia
              </button>
              <button
                className={filter === "lowPrice" ? "filter-tab active" : "filter-tab"}
                type="button"
                onClick={() => setFilter("lowPrice")}
              >
                Menos de $1,000
              </button>
            </div>
            <span className="sort-note">Selección de vendedores locales <span>✦</span></span>
          </div>

          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button type="button" aria-label="Cerrar aviso" onClick={() => setNotice("")}>×</button>
            </div>
          )}
          {error && !panel && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  void loadProducts();
                }}
              >
                Reintentar
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="loading-grid" aria-label="Cargando productos">
              {[1, 2, 3, 4].map((item) => <div className="loading-card" key={item} />)}
            </div>
          ) : visibleProducts.length > 0 ? (
            <div className="product-grid">
              {visibleProducts.map((product, index) => {
                const inCart = cart.find(
                  (item) => item.product.productId === product.productId,
                )?.quantity ?? 0;
                return (
                  <article className="product-card" key={product.productId}>
                    <div className={`product-visual visual-${index % 4}`}>
                      <span className="product-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="product-emoji" aria-hidden="true">
                        {productEmoji(product.name)}
                      </span>
                      <span className="product-stock">
                        {product.stock > 0 ? "DISPONIBLE" : "AGOTADO"}
                      </span>
                      <button
                        className="quick-add"
                        type="button"
                        aria-label={`Agregar ${product.name} al carrito`}
                        disabled={product.stock < 1}
                        onClick={() => addToCart(product)}
                      >
                        {inCart > 0 ? `+${inCart}` : "+"}
                      </button>
                    </div>
                    <div className="product-info">
                      <span className="product-seller">SELECCIÓN LOCAL <span>✦</span></span>
                      <h3>{product.name}</h3>
                      <p className="product-description">{product.description}</p>
                      <div className="product-card-bottom">
                        <strong>{money.format(product.price)}</strong>
                        <span>{product.stock > 0 ? `${product.stock} disponibles` : "Sin stock"}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-catalog">
              <span>⌕</span>
              <h3>No encontramos productos</h3>
              <p>Prueba otra búsqueda o cambia el filtro.</p>
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Ver todo el catálogo
              </button>
            </div>
          )}
        </section>

        <section className="seller-callout">
          <div className="callout-decoration" aria-hidden="true">✳</div>
          <div>
            <div className="eyebrow"><span /> ¿TIENES ALGO BUENO?</div>
            <h2>Tu próximo gran<br /><em>cliente está aquí.</em></h2>
          </div>
          <div className="callout-action">
            <p>Únete a nuestra comunidad de vendedores locales y comparte eso que haces increíble.</p>
            {auth?.user.role === "seller" ? (
              <button className="dark-button" type="button" onClick={() => setPanel("seller")}>
                Publicar producto <span>↗</span>
              </button>
            ) : (
              <button
                className="dark-button"
                type="button"
                onClick={() => {
                  setAuthMode("login");
                  setPanel("auth");
                  setNotice("Para vender, inicia sesión con una cuenta de vendedor.");
                }}
              >
                Soy vendedor <span>↗</span>
              </button>
            )}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand footer-brand" href="#inicio">
          <span className="brand-mark">a<span>.</span></span>
          <span className="brand-name">amazon<span>lite</span></span>
        </a>
        <span>Una tienda pequeña para encontrar grandes cosas.</span>
        <span className="footer-note">HECHO CON <b>♡</b> EN LOCALSTACK</span>
      </footer>

      {panel && (
        <div
          className="panel-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              dismissPanel();
            }
          }}
        >
          {panel === "cart" && (
            <section className="side-panel" role="dialog" aria-modal="true" aria-labelledby="cart-title">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow"><span /> TU SELECCIÓN</span>
                  <h2 id="cart-title">Tu carrito <em>({cartCount})</em></h2>
                </div>
                <button className="close-button" type="button" aria-label="Cerrar carrito" onClick={dismissPanel}>×</button>
              </div>
              {cart.length === 0 ? (
                <div className="panel-empty">
                  <span className="empty-bag">♧</span>
                  <h3>Tu carrito está esperando</h3>
                  <p>Cuando encuentres algo que te guste, aquí lo vas a ver.</p>
                  <button className="dark-button" type="button" onClick={dismissPanel}>Seguir explorando</button>
                </div>
              ) : (
                <>
                  <div className="cart-items">
                    {cart.map(({ product, quantity }) => (
                      <article className="cart-item" key={product.productId}>
                        <div className="cart-item-art">{productEmoji(product.name)}</div>
                        <div className="cart-item-copy">
                          <strong>{product.name}</strong>
                          <span>{money.format(product.price)} c/u</span>
                          <div className="quantity-control">
                            <button
                              type="button"
                              aria-label={`Quitar una unidad de ${product.name}`}
                              onClick={() => updateQuantity(product.productId, quantity - 1)}
                            >−</button>
                            <span>{quantity}</span>
                            <button
                              type="button"
                              aria-label={`Agregar una unidad de ${product.name}`}
                              disabled={quantity >= product.stock}
                              onClick={() => updateQuantity(product.productId, quantity + 1)}
                            >+</button>
                          </div>
                        </div>
                        <strong className="cart-item-total">{money.format(product.price * quantity)}</strong>
                      </article>
                    ))}
                  </div>
                  {error && <p className="form-error" role="alert">{error}</p>}
                  <div className="cart-summary">
                    <div><span>Subtotal</span><strong>{money.format(cartTotal)}</strong></div>
                    <small>El total final se calcula al confirmar tu pedido.</small>
                    <button className="dark-button checkout-button" type="button" disabled={isSubmitting} onClick={() => void handleCheckout()}>
                      {isSubmitting ? "Procesando..." : auth ? "Crear pedido" : "Inicia sesión para comprar"}
                      <span>↗</span>
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {panel === "auth" && (
            <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow"><span /> TU CUENTA</span>
                  <h2 id="auth-title">{authMode === "login" ? <>Qué gusto <em>verte.</em></> : <>Únete a <em>la comunidad.</em></>}</h2>
                </div>
                <button className="close-button" type="button" aria-label="Cerrar" onClick={dismissPanel}>×</button>
              </div>
              <div className="auth-tabs" role="tablist" aria-label="Acceso a tu cuenta">
                <button className={authMode === "login" ? "active" : ""} type="button" role="tab" aria-selected={authMode === "login"} onClick={() => { setAuthMode("login"); setError(""); }}>
                  Iniciar sesión
                </button>
                <button className={authMode === "register" ? "active" : ""} type="button" role="tab" aria-selected={authMode === "register"} onClick={() => { setAuthMode("register"); setError(""); }}>
                  Crear cuenta
                </button>
              </div>
              <form className="auth-form" onSubmit={(event) => void handleAuthSubmit(event)}>
                {authMode === "register" && (
                  <label>
                    Nombre
                    <input autoComplete="name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
                  </label>
                )}
                <label>
                  Correo electrónico
                  <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
                </label>
                <label>
                  Contraseña
                  <input type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} required minLength={authMode === "register" ? 8 : 1} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} />
                  {authMode === "register" && <small className="field-hint">Usa entre 8 y 72 caracteres.</small>}
                </label>
                {error && <p className="form-error" role="alert">{error}</p>}
                <button className="dark-button auth-submit" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Un momento..." : authMode === "login" ? "Iniciar sesión" : "Crear cuenta"}
                  <span>↗</span>
                </button>
              </form>
              <p className="privacy-note">Tu información se usa únicamente para gestionar tu cuenta y tus pedidos.</p>
            </section>
          )}

          {panel === "orders" && (
            <section className="side-panel" role="dialog" aria-modal="true" aria-labelledby="orders-title">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow"><span /> TU HISTORIAL</span>
                  <h2 id="orders-title">Mis <em>pedidos</em></h2>
                </div>
                <button className="close-button" type="button" aria-label="Cerrar pedidos" onClick={dismissPanel}>×</button>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              {isSubmitting ? (
                <div className="panel-empty"><span className="spinner" /><p>Cargando tus pedidos...</p></div>
              ) : orders.length > 0 ? (
                <div className="order-list">
                  {orders.map((order) => (
                    <article className="order-card" key={order.orderId}>
                      <div className="order-card-heading">
                        <strong>Pedido #{order.orderId.slice(0, 8)}</strong>
                        <span className={`order-status status-${order.status}`}>{order.status === "pending" ? "Pendiente" : order.status === "confirmed" ? "Confirmado" : "Cancelado"}</span>
                      </div>
                      <small>{new Date(order.createdAt).toLocaleDateString("es-MX", { dateStyle: "long" })}</small>
                      <div className="order-items">
                        {order.items.map((item) => (
                          <div key={item.productId}>
                            <span>{item.quantity} × {item.name}</span>
                            <span>{money.format(item.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="order-total"><span>Total</span><strong>{money.format(order.total)}</strong></div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="panel-empty">
                  <span className="empty-bag">↗</span>
                  <h3>Aún no tienes pedidos</h3>
                  <p>Tu próxima compra puede empezar con algo que te encante.</p>
                  <button className="dark-button" type="button" onClick={dismissPanel}>Seguir explorando</button>
                </div>
              )}
            </section>
          )}

          {panel === "seller" && (
            <section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="seller-title">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow"><span /> TU ESPACIO DE VENTA</span>
                  <h2 id="seller-title">Publica algo <em>bueno.</em></h2>
                </div>
                <button className="close-button" type="button" aria-label="Cerrar" onClick={dismissPanel}>×</button>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <form className="auth-form" onSubmit={(event) => void handleCreateProduct(event)}>
                <label>Nombre del producto<input name="productName" required maxLength={120} /></label>
                <label>Descripción<textarea name="description" required maxLength={2000} rows={3} /></label>
                <div className="seller-form-row">
                  <label>Precio (MXN)<input name="price" type="number" min="0.01" step="0.01" required /></label>
                  <label>Existencias<input name="stock" type="number" min="0" step="1" required /></label>
                </div>
                <button className="dark-button auth-submit" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Publicando..." : "Publicar producto"} <span>↗</span>
                </button>
              </form>
              <p className="privacy-note">Solo las cuentas con rol vendedor pueden publicar productos.</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
