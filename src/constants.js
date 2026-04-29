
// config.js
module.exports = {
    POLLING_INTERVAL: 15000,
    MAX_ERRORS: 5,
    
    LOCALES: {
        'se': {
            buyButton: 'Lägg i varukorg',
            soldText: 'Såld',
            reservedText: 'I en annan varukorg'
        },
        'de': {
            buyButton: 'In den Warenkorb',
            soldText: 'Verkauft',
            reservedText: 'In einem anderen Warenkorb'
        },
        'at': {
            buyButton: 'In den Warenkorb',
            soldText: 'Verkauft',
            reservedText: 'In einem anderen Warenkorb'
        },
        'com': {
            buyButton: 'Add to cart',
            soldText: 'Sold',
            reservedText: 'In another cart'
        }
    },

    SELECTORS: {
        SOLD_INDICATOR: 'div[data-testid="blob"]',
        RESERVED_ICON: 'i[data-testid="icon-CART_TIME"]',
        AVAILABLE_PARENT: 'span'
    }
};

