document.addEventListener('DOMContentLoaded', function() {
    highlightOfficeHoursNavItem();

    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('id');

    if (!postId) {
        window.location.href = 'office-hours.html';
        return;
    }

    fetch('office-hours/posts.json')
        .then(response => response.json())
        .then(posts => {
            const post = posts.find(p => p.id === postId);
            if (!post) {
                window.location.href = 'office-hours.html';
                return;
            }

            document.title = `Keunwoo Choi - ${post.title}`;

            const postDate = new Date(post.date).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            const dateElem = document.getElementById('post-date');
            if (dateElem) dateElem.textContent = postDate;

            return fetch(`office-hours/${post.file}`);
        })
        .then(response => response.text())
        .then(markdown => {
            marked.setOptions({
                highlight: function(code, lang) {
                    if (Prism.languages[lang]) {
                        return Prism.highlight(code, Prism.languages[lang], lang);
                    } else {
                        return code;
                    }
                }
            });

            const content = document.getElementById('post-content');
            if (content) content.innerHTML = marked.parse(markdown);
            Prism.highlightAll();
        })
        .catch(error => {
            console.error('Error loading office hour:', error);
            const content = document.getElementById('post-content');
            if (content) content.innerHTML = '<p>Error loading office hour. Please try again later.</p>';
        });
});

function highlightOfficeHoursNavItem() {
    document.querySelectorAll('.navbar-nav .nav-item .nav-link').forEach(item => {
        item.classList.remove('active');
    });
    const officeNavItem = document.querySelector('.navbar-nav .nav-item .nav-link[href="office-hours.html"]');
    if (officeNavItem) {
        officeNavItem.classList.add('active');
    }
}


