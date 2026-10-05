require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const { engine } = require('express-handlebars');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Cấu hình Handlebars
app.engine('hbs', engine({ extname: '.hbs' }));
app.set('view engine', 'hbs');

const readConn = mongoose.createConnection(process.env.MONGO_URI_READ);
const writeConn = mongoose.createConnection(process.env.MONGO_URI_WRITE);

// Định nghĩa Schema
const bookSchema = new mongoose.Schema({
    maSP: String,
    tenSach: String,
    giaGoc: Number,
    giaSauThue: Number
});

const BookRead = readConn.model('Book', bookSchema);
const BookWrite = writeConn.model('Book', bookSchema);

// 2. Stateless Session lưu xuống MongoDB Atlas
const store = new MongoDBStore({
    uri: process.env.MONGO_URI_WRITE,
    collection: 'sessions'
});

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: store 
}));

// Thông tin cá nhân hóa
const mssv = process.env.MSSV;
const hoTen = process.env.HO_TEN;
const prefixMSSV = mssv.slice(-3);
const lastDigitMSSV = parseInt(mssv.slice(-1));
const vatRate = lastDigitMSSV + 5; // Tính VAT động

// Middleware truyền dữ liệu chung cho Handlebars Footer
app.use((req, res, next) => {
    res.locals.mssv = mssv;
    res.locals.hoTen = hoTen;
    res.locals.vatRate = vatRate;
    next();
});

// Route hiển thị danh sách 
app.get('/', async (req, res) => {
    try {
        const books = await BookRead.find({}).lean(); 
        
        // Tăng biến đếm session để chứng minh Stateless đang hoạt động
        req.session.views = (req.session.views || 0) + 1;

        res.render('home', { 
            books, 
            sessionViews: req.session.views,
            prefixMSSV 
        });
    } catch (err) {
        res.status(500).send("Lỗi đọc dữ liệu");
    }
});

// Route thêm sách mới 
app.post('/add', async (req, res) => {
    const { maSP, tenSach, giaGoc } = req.body;

    if (!maSP.startsWith(prefixMSSV)) {
        return res.status(400).send(`Lỗi: Mã sản phẩm phải bắt đầu bằng 3 số cuối MSSV (${prefixMSSV})`);
    }

    // Tự động tính giá sau thuế trước khi lưu
    const giaGocNum = parseFloat(giaGoc);
    const giaSauThue = giaGocNum + (giaGocNum * vatRate / 100);

    try {
        const newBook = new BookWrite({ // Tự động điều hướng luồng Write
            maSP,
            tenSach,
            giaGoc: giaGocNum,
            giaSauThue
        });
        await newBook.save();
        res.redirect('/');
    } catch (err) {
        res.status(500).send("Lỗi ghi dữ liệu");
    }
});

app.listen(process.env.PORT, () => console.log(`Server chạy tại port ${process.env.PORT}`));