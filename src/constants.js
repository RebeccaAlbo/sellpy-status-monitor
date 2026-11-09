
// config.js
module.exports = {
    SLOW_INTERVAL: 20000,
    FAST_INTERVAL: 5000,
    
    BACKOFF: {
        BASE_MS: 1000,      // 1s
        MAX_MS: 60000,      // cap at 60s
        MAX_ATTEMPTS: 5,
    },
     
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

