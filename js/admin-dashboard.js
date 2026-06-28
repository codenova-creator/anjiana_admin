import { db, collection, getDocs, doc, deleteDoc } from './firebase-config.js';

const productTableBody = document.querySelector('tbody');

async function loadProducts() {
    if (!productTableBody) return;
    
    productTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Loading products...</td></tr>';
    
    try {
        const querySnapshot = await getDocs(collection(db, "products"));
        productTableBody.innerHTML = '';
        
        if (querySnapshot.empty) {
            productTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No products found.</td></tr>';
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            
            const stockStatus = data.stock > 10 
                ? `<span style="background: #E8F5E9; color: #2E7D32; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">In Stock (${data.stock})</span>`
                : data.stock > 0 
                    ? `<span style="background: #FFE0B2; color: #E65100; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">Low Stock (${data.stock})</span>`
                    : `<span style="background: #FFEBEE; color: #C62828; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;">Out of Stock (0)</span>`;

            const price = parseFloat(data.price);
            const discount = parseFloat(data.discount || 0);
            let priceHTML = `$${price.toFixed(2)}`;
            if (discount > 0) {
                const discountedPrice = price * (1 - discount / 100);
                priceHTML = `
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <span style="text-decoration: line-through; color: var(--text-muted); font-size: 0.75rem;">$${price.toFixed(2)}</span>
                        <span style="font-weight: 600; color: var(--accent-color); font-size: 0.9rem;">$${discountedPrice.toFixed(2)}</span>
                        <span style="background: rgba(212, 175, 55, 0.1); color: var(--accent-color); padding: 1px 4px; border-radius: 2px; font-size: 0.7rem; font-weight: 500; width: fit-content;">-${discount}%</span>
                    </div>
                `;
            }

            const getStorefrontUrl = (id) => {
                const origin = window.location.origin;
                if (origin.includes('localhost:') || origin.includes('127.0.0.1:')) {
                    return origin.replace(/:\d+$/, ':8000') + `/product-details.html?id=${id}&nocache=1`;
                }
                return `../product-details.html?id=${id}`;
            };

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><img src="${data.imageUrl || '../images/placeholder.png'}" style="width: 40px; height: 50px; object-fit: cover; border-radius: 4px;" alt="product"></td>
                <td style="font-weight: 500;">${data.name}</td>
                <td style="color: var(--text-muted);">${data.category}</td>
                <td>${priceHTML}</td>
                <td>${stockStatus}</td>
                <td>
                    <a href="${getStorefrontUrl(id)}" target="_blank" class="btn btn-secondary view-btn" style="padding: 6px 12px; font-size: 0.8rem; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; height: 32px; vertical-align: middle; margin-right: 4px;">View</a>
                    <button class="btn btn-secondary edit-btn" data-id="${id}" style="padding: 6px 12px; font-size: 0.8rem; height: 32px; vertical-align: middle; margin-right: 4px;">Edit</button>
                    <button class="btn delete-btn" data-id="${id}" style="padding: 6px 12px; font-size: 0.8rem; background: #FFEBEE; color: #C62828; height: 32px; vertical-align: middle;">Delete</button>
                </td>
            `;
            productTableBody.appendChild(tr);
        });

        // Add event listeners for edit buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                window.location.href = `add-product.html?id=${id}`;
            });
        });

        // Add event listeners for delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if (confirm('Are you sure you want to delete this product?')) {
                    await deleteDoc(doc(db, "products", id));
                    loadProducts(); // Reload the table
                }
            });
        });

    } catch (error) {
        console.error("Error loading products: ", error);
        productTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Failed to load products.</td></tr>';
    }
}

// Load products on page load
document.addEventListener('DOMContentLoaded', () => {
    if (productTableBody) {
        loadProducts();
    }
});
