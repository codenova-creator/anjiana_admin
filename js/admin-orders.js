import { db, collection, getDocs, doc, updateDoc } from './firebase-config.js';

const ordersTableBody = document.getElementById('ordersTableBody');

async function loadOrders() {
    if (!ordersTableBody) return;
    
    try {
        const querySnapshot = await getDocs(collection(db, "orders"));
        ordersTableBody.innerHTML = '';
        
        if (querySnapshot.empty) {
            ordersTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No orders found.</td></tr>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const customerName = `${data.customer.firstName} ${data.customer.lastName}`;
            const numItems = data.items.reduce((sum, item) => sum + item.quantity, 0);
            
            let statusColor = '#9E9E9E'; // default
            switch(data.orderStatus) {
                case 'Pending': statusColor = '#FF9800'; break;
                case 'Processing': statusColor = '#2196F3'; break;
                case 'Shipped': statusColor = '#9C27B0'; break;
                case 'Delivered': statusColor = '#4CAF50'; break;
                case 'Cancelled': statusColor = '#F44336'; break;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family: monospace; font-size: 0.9rem;">${id.slice(0, 8)}...</td>
                <td style="font-weight: 500;">
                    ${customerName}<br>
                    <span style="font-weight: normal; color: var(--text-muted); font-size: 0.8rem;">${data.customer.email}</span>
                </td>
                <td>${numItems} items</td>
                <td style="font-weight: 500;">$${data.totalAmount.toFixed(2)}</td>
                <td>
                    <select class="status-select" data-id="${id}" style="padding: 4px; border: 1px solid var(--border-color); border-radius: 4px; color: ${statusColor}; font-weight: 500;">
                        <option value="Pending" ${data.orderStatus === 'Pending' ? 'selected' : ''}>Pending</option>
                        <option value="Processing" ${data.orderStatus === 'Processing' ? 'selected' : ''}>Processing</option>
                        <option value="Shipped" ${data.orderStatus === 'Shipped' ? 'selected' : ''}>Shipped</option>
                        <option value="Delivered" ${data.orderStatus === 'Delivered' ? 'selected' : ''}>Delivered</option>
                        <option value="Cancelled" ${data.orderStatus === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
                <td>
                    <button class="btn btn-secondary view-btn" data-id="${id}" style="padding: 6px 12px; font-size: 0.8rem;">View Details</button>
                </td>
            `;
            ordersTableBody.appendChild(tr);
        });

        // Event listener for status change
        document.querySelectorAll('.status-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const id = e.target.getAttribute('data-id');
                const newStatus = e.target.value;
                try {
                    await updateDoc(doc(db, "orders", id), { orderStatus: newStatus });
                    // Optional: show a small toast or just let it be updated
                    e.target.style.color = getStatusColor(newStatus);
                } catch (error) {
                    console.error("Error updating status:", error);
                    alert("Failed to update status.");
                }
            });
        });

        // Optional View Details button stub
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                alert(`Viewing order ${e.target.getAttribute('data-id')} is not fully implemented yet.`);
            });
        });

    } catch (error) {
        console.error("Error loading orders: ", error);
        ordersTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Failed to load orders.</td></tr>';
    }
}

function getStatusColor(status) {
    switch(status) {
        case 'Pending': return '#FF9800';
        case 'Processing': return '#2196F3';
        case 'Shipped': return '#9C27B0';
        case 'Delivered': return '#4CAF50';
        case 'Cancelled': return '#F44336';
        default: return '#9E9E9E';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadOrders();
});
