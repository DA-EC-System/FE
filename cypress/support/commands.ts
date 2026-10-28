/**
 * Lệnh dùng chung cho E2E. Dữ liệu mock nằm trong bộ nhớ trang nên mỗi lần `cy.visit`
 * là một bộ dữ liệu mới: mỗi `it` tự đăng nhập, không phụ thuộc test trước.
 */

type Method = 'get' | 'post' | 'put' | 'delete';

interface MswBridge {
  worker: { use: (...handlers: unknown[]) => void };
  http: Record<Method, (path: string, resolver: () => Response, options?: { once?: boolean }) => unknown>;
  HttpResponse: { json: (body: unknown, init?: ResponseInit) => Response };
  fire: (
    companyId: string,
    type: string,
    shopId?: string,
    params?: Record<string, string>,
  ) => { ok: true; entry: { message: string } } | { ok: false; message: string };
}

const msw = (win: Window) => {
  const bridge = (win as unknown as { __msw?: MswBridge }).__msw;
  if (!bridge) throw new Error('Cần chạy Vite dev với MSW (VITE_USE_MOCKS) để giả lập phản hồi BE');
  return bridge;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Đăng nhập; tài khoản nhiều công ty thì chọn công ty có tên chứa `congTy` */
      dangNhap(email: string, password: string, congTy?: string): Chainable<void>;
      /** Bấm mục trên thanh bên theo đúng chữ */
      menu(label: string): Chainable<JQuery<HTMLElement>>;
      /** Dòng bảng có `data-row-id` */
      dong(id: string): Chainable<JQuery<HTMLElement>>;
      /** Chờ thông báo (sonner) chứa đoạn chữ */
      toast(text: string | RegExp): Chainable<JQuery<HTMLElement>>;
      /** Chọn một mục trong Select (combobox) theo nhãn */
      chon(label: string, option: string | RegExp): Chainable<void>;
      /** Lần gọi kế tiếp tới `/api/v1<path>` trả về `status` + `body` (chỉ khi chạy MSW) */
      mockApi(method: Method, path: string, status: number, body: unknown): Chainable<void>;
      /** Sàn giả lập phát sự kiện thẳng vào mock, không qua trang sàn giả lập; trả câu kết quả (FE#81) */
      phatSuKienSan(type: string, shopId?: string, params?: Record<string, string>): Chainable<string>;
    }
  }
}

Cypress.Commands.add('dangNhap', (email: string, password: string, congTy = 'Thời trang ABC') => {
  cy.visit('/login');
  cy.get('input[name=email]').type(email);
  cy.get('input[name=password]').type(password, { log: false });
  cy.findByRole('button', { name: 'Đăng nhập' }).click();
  cy.location('pathname').should('match', /^\/(c\/|select-company)/);
  cy.location('pathname').then((path) => {
    if (path === '/select-company') cy.contains('button', congTy).click();
  });
  cy.location('pathname').should('match', /^\/c\/cmp-/);
});

Cypress.Commands.add('menu', (label: string) =>
  cy.contains('[data-sidebar="menu-button"]', new RegExp(`^\\s*${label}\\s*$`)).click(),
);

Cypress.Commands.add('dong', (id: string) => cy.get(`tbody tr[data-row-id="${id}"]`));

Cypress.Commands.add('toast', (text: string | RegExp) => cy.contains('[data-sonner-toast]', text));

Cypress.Commands.add('chon', (label: string, option: string | RegExp) => {
  cy.findByRole('combobox', { name: label }).click();
  // Danh sách lựa chọn nằm ở portal ngoài dialog nên tìm trên cả trang, kể cả khi đang trong within()
  cy.document().its('body').then(($body) => cy.wrap($body).findByRole('option', { name: option }).click());
});

Cypress.Commands.add('mockApi', (method: Method, path: string, status: number, body: unknown) => {
  cy.window().then((win) => {
    const { worker, http, HttpResponse } = msw(win);
    worker.use(http[method](`*/api/v1${path}`, () => HttpResponse.json(body, { status }), { once: true }));
  });
});

Cypress.Commands.add('phatSuKienSan', (type: string, shopId?: string, params: Record<string, string> = {}) =>
  cy.location('pathname').then((path) => {
    const companyId = path.split('/')[2] ?? '';
    return cy.window().then((win) => {
      const result = msw(win).fire(companyId, type, shopId, params);
      if (!result.ok) throw new Error(result.message);
      return result.entry.message;
    });
  }),
);

export {};
