import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import healthRouter from "./health";
import submissionsRouter from "./submissions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(submissionsRouter);
router.use(adminRouter);

export default router;
