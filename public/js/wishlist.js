async function toggleWishlist(productId, btnElement, options = {}) {
    console.log('toggleWishlist called for product:', productId); // Debug log
    try {
        const response = await fetch('/wishlist/toggle', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ productId })
        });

        console.log('Response status:', response.status); // Debug log

        const data = await response.json();
        console.log('Response data:', data); // Debug log

        if (response.status === 401) {
            window.location.href = '/login';
            return;
        }

        if (data.success) {
            // Visual Toggle
            if (btnElement) {
                const icon = btnElement.querySelector('i');
                if (data.added) {
                    btnElement.classList.add('btn-wishlist-active');
                    icon.classList.add('heart-pulse');
                    setTimeout(() => {
                        icon.classList.remove('heart-pulse');
                    }, 400);
                } else {
                    btnElement.classList.remove('btn-wishlist-active');
                }
            }

            // Notification
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    toast: true,
                    position: options.position || 'top-end',
                    icon: 'success',
                    title: data.message,
                    showConfirmButton: false,
                    timer: 1500
                });
            } else {
                alert(data.message);
            }

        } else {
            console.error('Failed to toggle wishlist:', data.message);
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    toast: true,
                    position: options.position || 'top-end',
                    icon: 'error',
                    title: data.message || 'Failed to update wishlist',
                    showConfirmButton: false,
                    timer: 1500
                });
            } else {
                alert(data.message || 'Failed to update wishlist');
            }
        }

    } catch (error) {
        console.error('Error in toggleWishlist:', error);
        alert('An error occurred while updating wishlist');
    }
}

async function removeFromWishlist(productId) {
    try {
        const response = await fetch('/wishlist/remove', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ productId })
        });

        const data = await response.json();

        if (data.success) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: data.message,
                    showConfirmButton: false,
                    timer: 1500
                }).then(() => {
                    location.reload(); // Reload to update list
                });
            } else {
                location.reload();
            }
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

document.addEventListener('DOMContentLoaded', function (e) {
    // Detail page button
    const wishlistBtn = document.getElementById('wishlist-btn-detail');
    if (wishlistBtn) {
        wishlistBtn.addEventListener('click', function (e) {
            e.preventDefault();
            const productId = this.getAttribute('data-product-id');
            console.log('Wishlist detail button clicked for:', productId);
            toggleWishlist(productId, this, {
                position: 'center'
            });
        });
    }

    // Remove buttons on wishlist page (Event Delegation)
    document.addEventListener('click', function (e) {
        const removeBtn = e.target.closest('.remove-wishlist-btn');
        if (removeBtn) {
            e.preventDefault();
            const productId = removeBtn.getAttribute('data-product-id');
            console.log('Remove button clicked for:', productId);
            removeFromWishlist(productId);
        }
    });
});
