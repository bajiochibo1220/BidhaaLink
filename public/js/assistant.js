(function () {
  if (window.self !== window.top) return;
  if (document.getElementById('blAssistantLauncher')) return;

  const history = [];
  const icon = '<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>';
  const launcher = document.createElement('button');
  launcher.id = 'blAssistantLauncher';
  launcher.className = 'bl-assistant-launcher';
  launcher.type = 'button';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'blAssistantPanel');
  launcher.setAttribute('aria-label', 'Ask BidhaaLink');
  launcher.innerHTML = `${icon}<span class="bl-assistant-prompt">Ask BidhaaLink</span><span class="bl-assistant-pulse" aria-hidden="true"></span>`;

  const panel = document.createElement('section');
  panel.id = 'blAssistantPanel';
  panel.className = 'bl-assistant-panel';
  panel.setAttribute('aria-label', 'BidhaaLink assistant');
  panel.innerHTML = `
    <header class="bl-assistant-head"><div><strong>BidhaaLink Assistant</strong><small>Find products across our shops</small></div><button class="bl-assistant-close" type="button" aria-label="Close assistant">&times;</button></header>
    <div class="bl-assistant-log" role="log" aria-live="polite"></div>
    <form class="bl-assistant-form"><input class="bl-assistant-input" maxlength="1000" autocomplete="off" aria-label="Ask the assistant" placeholder="Try: affordable shoes in Nairobi" required><button class="bl-assistant-send" type="submit">Send</button></form>
    <div class="bl-assistant-note">Shop details come from active listings. Education and job research uses linked sources when AI is enabled.</div>`;

  document.body.append(launcher, panel);
  const log = panel.querySelector('.bl-assistant-log');
  const form = panel.querySelector('form');
  const input = panel.querySelector('input');
  const send = panel.querySelector('.bl-assistant-send');

  function addBubble(text, kind) {
    const bubble = document.createElement('div');
    bubble.className = `bl-assistant-bubble${kind ? ` is-${kind}` : ''}`;
    bubble.textContent = text;
    log.appendChild(bubble);
    return bubble;
  }

  function addSourceLinks(citations) {
    if (!Array.isArray(citations) || !citations.length) return;
    const section = document.createElement('div');
    section.className = 'bl-assistant-sources';
    const heading = document.createElement('strong');
    heading.textContent = 'Sources';
    section.appendChild(heading);
    citations.slice(0, 8).forEach((citation, index) => {
      if (!/^https:\/\//i.test(citation.url || '')) return;
      const link = document.createElement('a');
      link.href = citation.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `${index + 1}. ${citation.title || citation.url}`;
      section.appendChild(link);
    });
    log.appendChild(section);
  }

  function addProducts(products) {
    if (!Array.isArray(products) || !products.length) return;
    const list = document.createElement('div');
    list.className = 'bl-assistant-products';
    products.forEach(product => {
      const card = document.createElement('a');
      card.className = 'bl-assistant-product';
      card.href = product.url;
      const image = document.createElement('img');
      image.src = product.image || '/icons/pwa-192.png';
      image.alt = '';
      image.loading = 'lazy';
      const details = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = product.name || 'Product';
      const price = document.createElement('span');
      price.className = 'bl-assistant-price';
      const rawPrice = String(product.price || '').trim();
      price.textContent = rawPrice ? (/^(?:ksh|kes)\b/i.test(rawPrice) ? rawPrice : `KSh ${rawPrice}`) : 'Price not listed';
      const seller = document.createElement('span');
      seller.textContent = product.business_name || 'BidhaaLink shop';
      const place = document.createElement('span');
      place.textContent = product.business_location || 'Location not listed';
      const tag = document.createElement('span');
      tag.textContent = product.business_search_tag ? `Search tag: ${product.business_search_tag}` : '';
      details.append(name, price, seller, place);
      if (product.business_search_tag) details.appendChild(tag);
      card.append(image, details);
      list.appendChild(card);
    });
    log.appendChild(list);
  }

  function openAssistant(open) {
    panel.classList.toggle('is-open', open);
    launcher.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
  }

  launcher.addEventListener('click', () => openAssistant(!panel.classList.contains('is-open')));
  panel.querySelector('.bl-assistant-close').addEventListener('click', () => openAssistant(false));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || send.disabled) return;
    addBubble(message, 'user');
    input.value = '';
    send.disabled = true;
    const waiting = addBubble('Searching BidhaaLink…');
    try {
      const response = await fetch('/api/assistant/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history })
      });
      const data = await response.json();
      waiting.remove();
      if (!response.ok) throw new Error(data.error || 'Could not contact the assistant.');
      addBubble(data.reply || 'Here are the results I found.');
      addSourceLinks(data.citations);
      addProducts(data.products);
      history.push({ role: 'user', content: message }, { role: 'assistant', content: data.reply || '' });
      if (history.length > 8) history.splice(0, history.length - 8);
    } catch (error) {
      waiting.remove();
      addBubble(error.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      send.disabled = false;
      input.focus();
      log.scrollTop = log.scrollHeight;
    }
  });

  addBubble('Hi! Tell me what you need, your budget, or where you want to shop. I’ll search active BidhaaLink listings and show the shop, price, and location.');
})();
