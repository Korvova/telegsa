// embed.ts - Telegsar Form Widget
// Используется для встраивания форм на внешние сайты

(function() {
  'use strict';

  const TELEGSAR_BASE = 'https://telegsar.com';

  interface TelegsarWidgetConfig {
    formId: string;
    container?: HTMLElement | string;
    height?: string;
    width?: string;
  }

  class TelegsarWidget {
    private formId: string;
    private container: HTMLElement;
    private iframe: HTMLIFrameElement | null = null;
    private config: TelegsarWidgetConfig;

    constructor(config: TelegsarWidgetConfig) {
      this.config = config;
      this.formId = config.formId;

      // Найти контейнер
      if (typeof config.container === 'string') {
        const el = document.querySelector(config.container);
        if (!el) {
          throw new Error(`Container not found: ${config.container}`);
        }
        this.container = el as HTMLElement;
      } else if (config.container) {
        this.container = config.container;
      } else {
        throw new Error('Container is required');
      }

      this.render();
      this.setupAutoResize();
    }

    private render() {
      // Создаем iframe
      this.iframe = document.createElement('iframe');
      this.iframe.src = `${TELEGSAR_BASE}/form/${this.formId}`;
      this.iframe.style.width = this.config.width || '100%';
      this.iframe.style.height = this.config.height || '600px';
      this.iframe.style.border = 'none';
      this.iframe.style.overflow = 'hidden';
      this.iframe.setAttribute('scrolling', 'no');

      // Очищаем контейнер и добавляем iframe
      this.container.innerHTML = '';
      this.container.appendChild(this.iframe);
    }

    private setupAutoResize() {
      // Слушаем сообщения от iframe для auto-resize
      window.addEventListener('message', (event) => {
        // Проверяем origin для безопасности
        if (event.origin !== TELEGSAR_BASE) return;

        if (event.data.type === 'telegsar-form-resize' && this.iframe) {
          const height = event.data.height;
          if (typeof height === 'number' && height > 0) {
            this.iframe.style.height = `${height}px`;
          }
        }

        // Обработка успешной отправки формы
        if (event.data.type === 'telegsar-form-submitted') {
          // Можно добавить callback
          const submitEvent = new CustomEvent('telegsarFormSubmitted', {
            detail: { formId: this.formId }
          });
          window.dispatchEvent(submitEvent);
        }
      });
    }

    public destroy() {
      if (this.iframe && this.iframe.parentNode) {
        this.iframe.parentNode.removeChild(this.iframe);
      }
      this.iframe = null;
    }
  }

  // Автоинициализация при загрузке скрипта
  function autoInit() {
    // Находим все скрипты с data-form-id
    const scripts = document.querySelectorAll('script[data-form-id]');

    scripts.forEach((script) => {
      const formId = script.getAttribute('data-form-id');
      if (formId && script instanceof HTMLScriptElement) {
        // Проверяем, не инициализирован ли уже этот скрипт
        if (!script.hasAttribute('data-telegsar-initialized')) {
          script.setAttribute('data-telegsar-initialized', 'true');

          // Создаём контейнер после скрипта
          const container = document.createElement('div');
          container.className = 'telegsar-form-widget';
          script.parentNode?.insertBefore(container, script.nextSibling);

          new TelegsarWidget({
            formId,
            container
          });
        }
      }
    });
  }

  // Экспортируем в глобальную область видимости
  (window as any).TelegsarWidget = TelegsarWidget;

  // Автоинициализация если есть data-form-id
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  // Также запускаем при каждом добавлении нового скрипта
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLScriptElement && node.hasAttribute('data-form-id')) {
          setTimeout(autoInit, 0);
        }
      });
    });
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
