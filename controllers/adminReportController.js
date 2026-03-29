const Order = require("../models/Order");

exports.getSalesReport = async (req, res) => {
  try {
    const { filterType = 'weekly', startDate, endDate } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (filterType === 'daily') {
      dateFilter = { $gte: today };
    } else if (filterType === 'weekly') {
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      dateFilter = { $gte: lastWeek };
    } else if (filterType === 'yearly') {
      const thisYear = new Date(now.getFullYear(), 0, 1);
      dateFilter = { $gte: thisYear };
    } else if (filterType === 'custom' && startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
      };
    } else {
      // Fallback
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      dateFilter = { $gte: lastWeek };
    }

    // Isolate query
    const query = {
      orderedDate: dateFilter,
      orderStatus: { $ne: 'Cancelled' }
    };

    const orders = await Order.find(query)
      .populate('userId', 'email') // Adjust fields based on what's available
      .sort({ orderedDate: -1 });

    let totalSalesAmount = 0;
    let totalDiscount = 0;
    let totalReturnedAmount = 0;
    const salesCount = orders.length;

    orders.forEach(order => {
      totalSalesAmount += (order.totalAmount || 0);
      totalDiscount += (order.discountAmount || order.discount || 0);
      
      // Calculate returns for this order
      if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
          if (item.itemStatus === 'Returned') {
            totalReturnedAmount += (item.finalPricePaid || item.itemTotal || 0);
          }
        });
      }
    });

    const finalNetRevenue = totalSalesAmount - totalReturnedAmount;

    res.render("admin/report/sales", {
      pageTitle: "Sales Report",
      path: "/admin/sales-report",
      filterType,
      startDate: startDate || '',
      endDate: endDate || '',
      orders,
      totalSalesAmount,
      totalDiscount,
      totalReturnedAmount,
      finalNetRevenue,
      salesCount
    });
  } catch (error) {
    console.error("Sales Report Aggregation Error:", error);
    res.status(500).send("Server Error");
  }
};
