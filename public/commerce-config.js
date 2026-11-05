/* Public catalog configuration. Never put secret keys in this file.
   Add only verified Stripe Payment Links for the matching product and size.
   Until confirmed prices and links are set, checkout stays unavailable. */
window.FIGURE_COMMERCE = {
  currency: 'USD',
  products: {
    '001': { price: 22000, paymentLinks: {} }
  }
};
