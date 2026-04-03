const createId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '/api' : '/Kasa-Ilaya-Resort/api');

const dispatchAuthChange = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth-changed'));
    window.dispatchEvent(new CustomEvent('local-auth-changed'));
  }
};

const buildApiUrl = (path) => `${API_BASE_URL}${path}`;

const buildLoginUrl = (nextUrl) => {
  const params = new URLSearchParams();
  if (nextUrl) {
    params.set('next', nextUrl);
  }
  return `/Login${params.toString() ? `?${params.toString()}` : ''}`;
};

const request = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  let body = options.body;

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const response = await fetch(buildApiUrl(path), {
    credentials: 'include',
    ...options,
    headers,
    body,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload?.error || 'Request failed.';
    throw new Error(message);
  }

  return payload;
};

const createBookingReference = () => {
  const now = new Date();
  const datePart = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const serial = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `KI-${datePart}-${serial}`;
};

const withEntityDefaults = (entityName, payload) => {
  if (entityName === 'Booking') {
    return {
      booking_reference: payload.booking_reference || createBookingReference(),
      status: payload.status || 'pending',
      payment_status: payload.payment_status || (payload.receipt_url ? 'pending_verification' : 'unpaid'),
      ...payload,
    };
  }

  if (entityName === 'Review') {
    return {
      is_approved: payload.is_approved ?? true,
      ...payload,
    };
  }

  if (entityName === 'FoundItem') {
    return {
      status: payload.status || 'unclaimed',
      is_active: payload.is_active ?? true,
      ...payload,
    };
  }

  if (entityName === 'LostItemReport') {
    return {
      status: payload.status || 'searching',
      ...payload,
    };
  }

  return payload;
};

const createEntityHandler = (entityName) => ({
  async list(sortField, limit) {
    const params = new URLSearchParams({ entity: entityName });
    if (sortField) {
      params.set('sort', sortField);
    }
    if (typeof limit === 'number') {
      params.set('limit', String(limit));
    }
    return request(`/entities.php?${params.toString()}`);
  },
  async filter(query = {}, sortField, limit) {
    const params = new URLSearchParams({ entity: entityName, filter: JSON.stringify(query) });
    if (sortField) {
      params.set('sort', sortField);
    }
    if (typeof limit === 'number') {
      params.set('limit', String(limit));
    }
    return request(`/entities.php?${params.toString()}`);
  },
  async create(data) {
    return request(`/entities.php?entity=${encodeURIComponent(entityName)}`, {
      method: 'POST',
      body: {
        id: data.id || createId(entityName.toLowerCase()),
        ...withEntityDefaults(entityName, data),
      },
    });
  },
  async update(id, data) {
    return request(`/entities.php?entity=${encodeURIComponent(entityName)}&id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: data,
    });
  },
  async delete(id) {
    return request(`/entities.php?entity=${encodeURIComponent(entityName)}&id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
});

export const baseClient = {
  auth: {
    async me() {
      return request('/auth.php?action=me');
    },
    async login(data) {
      const payload = await request('/auth.php?action=login', {
        method: 'POST',
        body: data,
      });
      dispatchAuthChange();
      return payload;
    },
    async getGoogleConfig() {
      return request('/auth.php?action=google-config');
    },
    async googleLogin(data) {
      const payload = await request('/auth.php?action=google-login', {
        method: 'POST',
        body: data,
      });
      dispatchAuthChange();
      return payload;
    },
    async register(data) {
      const payload = await request('/auth.php?action=register', {
        method: 'POST',
        body: data,
      });
      dispatchAuthChange();
      return payload;
    },
    async updateMe(data) {
      const user = await request('/auth.php?action=update-me', {
        method: 'PATCH',
        body: data,
      });
      dispatchAuthChange();
      return user;
    },
    async changePassword(data) {
      return request('/auth.php?action=change-password', {
        method: 'POST',
        body: data,
      });
    },
    async forgotPassword(data) {
      return request('/auth.php?action=forgot-password', {
        method: 'POST',
        body: data,
      });
    },
    async sendRegistrationOtp(data) {
      return request('/auth.php?action=send-registration-otp', {
        method: 'POST',
        body: data,
      });
    },
    async verifyRegistrationOtp(data) {
      return request('/auth.php?action=verify-registration-otp', {
        method: 'POST',
        body: data,
      });
    },
    async validateResetToken(token) {
      return request(`/auth.php?action=validate-reset-token&token=${encodeURIComponent(token)}`);
    },
    async resetPassword(data) {
      return request('/auth.php?action=reset-password', {
        method: 'POST',
        body: data,
      });
    },
    redirectToLogin(nextUrl = typeof window !== 'undefined' ? window.location.href : '/') {
      if (typeof window !== 'undefined') {
        window.location.href = buildLoginUrl(nextUrl);
      }
      return Promise.resolve(null);
    },
    logout(redirectUrl = '/') {
      return request('/auth.php?action=logout', {
        method: 'POST',
        body: { redirect_url: redirectUrl },
      }).then((payload) => {
        // Clear client-side storage that may hold cached UI state, then notify app
        try {
          if (typeof window !== 'undefined') {
            try { window.sessionStorage.clear(); } catch (e) {}
            try { window.localStorage.clear(); } catch (e) {}
          }
        } catch (e) {}

        dispatchAuthChange();
        if (typeof window !== 'undefined' && payload?.redirect_url) {
          window.location.href = payload.redirect_url;
        }
      });
    },
  },
  inquiries: {
    async list(status) {
      const params = new URLSearchParams({ action: 'list' });
      if (status) {
        params.set('status', status);
      }
      return request(`/inquiries.php?${params.toString()}`);
    },
    async mine(tokens = []) {
      return request('/inquiries.php?action=mine', {
        method: 'POST',
        body: { tokens },
      });
    },
    async create(data) {
      return request('/inquiries.php?action=create', {
        method: 'POST',
        body: data,
      });
    },
    async thread(id, token) {
      return request('/inquiries.php?action=thread', {
        method: 'POST',
        body: { id, token },
      });
    },
    async reply(id, data) {
      return request(`/inquiries.php?action=reply&id=${encodeURIComponent(id)}`, {
        method: 'POST',
        body: data,
      });
    },
    async updateStatus(id, status) {
      return request(`/inquiries.php?action=status&id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { status },
      });
    },
  },
  entities: {
    ActivityLog: createEntityHandler('ActivityLog'),
    Booking: createEntityHandler('Booking'),
    FoundItem: createEntityHandler('FoundItem'),
    LostItemReport: createEntityHandler('LostItemReport'),
    Package: createEntityHandler('Package'),
    PaymentQrCode: createEntityHandler('PaymentQrCode'),
    ResortRule: createEntityHandler('ResortRule'),
    SiteSetting: createEntityHandler('SiteSetting'),
    UpcomingSchedule: createEntityHandler('UpcomingSchedule'),
    User: createEntityHandler('User'),
    Review: createEntityHandler('Review'),
  },
  integrations: {
    Core: {
      async UploadFile({ file }) {
        const formData = new FormData();
        formData.append('file', file);
        return request('/integrations.php?action=upload-file', {
          method: 'POST',
          body: formData,
        });
      },
      async SendEmail(payload) {
        return request('/integrations.php?action=send-email', {
          method: 'POST',
          body: payload,
        });
      },
      async InvokeLLM({ prompt }) {
        const response = await request('/integrations.php?action=invoke-llm', {
          method: 'POST',
          body: { prompt },
        });
        return response.response;
      },
    },
  },
};
