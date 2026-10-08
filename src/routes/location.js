// Customer location sharing, preferred-area storage, live-location requests,
// and IP-based discovery have been retired. Customers can find places by
// typing them into the marketplace search field.
const express = require('express');
const router = express.Router();

router.use((req, res) => {
  res.status(410).json({
    error: 'Customer location services are no longer available. Search by entering a business, product, service, town, or county.'
  });
});

module.exports = router;
